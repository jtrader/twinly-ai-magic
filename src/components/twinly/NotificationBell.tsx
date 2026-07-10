import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Bot, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import {
  listMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
} from "@/lib/notifications.functions";

type Notification = Awaited<ReturnType<typeof listMyNotifications>>["notifications"][number];

export function NotificationBell() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadList = useServerFn(listMyNotifications);
  const loadCount = useServerFn(getUnreadNotificationCount);
  const markRead = useServerFn(markNotificationRead);
  const markAllRead = useServerFn(markAllNotificationsRead);

  useEffect(() => {
    if (!user) return;
    loadCount().then((r) => setUnread(r.count)).catch(() => {});
  }, [user, loadCount]);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    loadList()
      .then((r) => setItems(r.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, user, loadList]);

  if (!user) return null;

  async function openNotification(n: Notification) {
    if (!n.read_at) {
      await markRead({ data: { id: n.id } }).catch(() => {});
      setItems((s) => s.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link_path) navigate({ to: n.link_path as any });
  }

  async function handleMarkAll() {
    await markAllRead({}).catch(() => {});
    setItems((s) => s.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative rounded-full p-1.5 text-muted-foreground hover:bg-surface-elevated hover:text-foreground" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</span>
          {unread > 0 && (
            <button onClick={handleMarkAll} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <CheckCheck className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground">No notifications yet.</div>
          )}
          {!loading && items.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotification(n)}
              className={
                "flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition hover:bg-surface-elevated " +
                (n.read_at ? "opacity-60" : "")
              }
            >
              <div className="flex items-center gap-1.5">
                {!n.read_at && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
                <span className="text-xs font-semibold">{n.title}</span>
                {n.is_ai_generated && (
                  <span className="ml-auto flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest text-ai">
                    <Bot className="size-2.5" /> AI
                  </span>
                )}
              </div>
              {n.body && <div className="line-clamp-2 text-[11px] text-muted-foreground">{n.body}</div>}
              <div className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
