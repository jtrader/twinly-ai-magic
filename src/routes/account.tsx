import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useUserRoles } from "@/lib/session";
import { listMyBlocks, unblockUserId } from "@/lib/blocks.functions";
import { getMyNotificationPreferences, updateMyNotificationPreferences } from "@/lib/notifications.functions";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { user, loading } = useSession();
  const roles = useUserRoles(user?.id);
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roles</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.length === 0
            ? <span className="text-sm text-muted-foreground">—</span>
            : roles.map((r) => (
                <span key={r} className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-semibold uppercase tracking-widest">{r}</span>
              ))}
        </div>
      </div>
      {user && <NotificationPreferencesSection />}
      {user && <BlockedUsersSection />}
      <div className="mt-6">
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
      </div>
    </AppShell>
  );
}

type Prefs = Awaited<ReturnType<typeof getMyNotificationPreferences>>["preferences"];

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useServerFn(getMyNotificationPreferences);
  const update = useServerFn(updateMyNotificationPreferences);

  useEffect(() => {
    load().then((r) => setPrefs(r.preferences)).catch(() => {});
  }, [load]);

  async function toggle(field: "inAppEnabled" | "newContent" | "personaReply" | "escalationUpdates", column: keyof Prefs, value: boolean) {
    setPrefs((p) => p ? { ...p, [column]: value } as Prefs : p);
    setBusy(true);
    try {
      await update({ data: { [field]: value } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save preference");
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notifications</div>
      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">In-app notifications</div>
            <div className="text-xs text-muted-foreground">Turn off to silence everything below.</div>
          </div>
          <Switch checked={prefs.in_app_enabled} disabled={busy} onCheckedChange={(v) => toggle("inAppEnabled", "in_app_enabled", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">New content from creators you follow</div>
          <Switch checked={prefs.new_content} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("newContent", "new_content", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">Replies from a Real Me creator</div>
          <Switch checked={prefs.persona_reply} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("personaReply", "persona_reply", v)} />
        </label>
        <label className="flex items-center justify-between">
          <div className="text-sm">Real Me request updates</div>
          <Switch checked={prefs.escalation_updates} disabled={busy || !prefs.in_app_enabled} onCheckedChange={(v) => toggle("escalationUpdates", "escalation_updates", v)} />
        </label>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Email and push aren't wired up yet — in-app is the only channel that actually delivers right now.</p>
    </div>
  );
}

function BlockedUsersSection() {
  const [blocks, setBlocks] = useState<Awaited<ReturnType<typeof listMyBlocks>>["blocks"]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useServerFn(listMyBlocks);
  const unblock = useServerFn(unblockUserId);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await load();
      setBlocks(res.blocks);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load blocked users");
    } finally {
      setLoadingList(false);
    }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  async function doUnblock(userId: string) {
    setBusyId(userId);
    try {
      await unblock({ data: { userId } });
      setBlocks((s) => s.filter((b) => b.userId !== userId));
      toast.success("Unblocked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unblock");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Blocked users</div>
      {loadingList && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
      {!loadingList && blocks.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">You haven't blocked anyone.</p>
      )}
      {!loadingList && blocks.length > 0 && (
        <ul className="mt-2 space-y-2">
          {blocks.map((b) => (
            <li key={b.userId} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
              <span>{b.profile?.display_name ?? "Unknown user"}</span>
              <Button size="sm" variant="ghost" disabled={busyId === b.userId} onClick={() => doUnblock(b.userId)}>
                {busyId === b.userId ? "…" : "Unblock"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}