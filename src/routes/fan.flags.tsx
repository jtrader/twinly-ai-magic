import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { listMyConversationFlags } from "@/lib/conversation-flags.functions";
import { ArrowLeft, Flag, Clock, CheckCircle2, XCircle, UserCheck, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/fan/flags")({
  component: MyFlagsPage,
  head: () => ({
    meta: [
      { title: "Your flagged chats — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const REASON_LABEL: Record<string, string> = {
  off_tone: "Off tone",
  inaccurate: "Inaccurate",
  uncomfortable: "Uncomfortable",
  wants_human: "Wanted the creator",
  other: "Other",
};

const STATUS_META: Record<string, { icon: any; cls: string; label: string }> = {
  open: { icon: Clock, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", label: "In review" },
  acknowledged: { icon: CheckCircle2, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "Acknowledged" },
  handed_off: { icon: UserCheck, cls: "border-brand/40 bg-brand/10 text-brand-glow", label: "Handed off" },
  dismissed: { icon: XCircle, cls: "border-border bg-surface text-muted-foreground", label: "Dismissed" },
};

function MyFlagsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(listMyConversationFlags);
  const [flags, setFlags] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const res = await load({});
      setFlags(res.flags);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load flags");
    } finally {
      setReady(true);
    }
  }, [load]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/fan" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your account</div>
          <h1 className="font-display text-2xl font-bold">Flagged chats</h1>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Chats you've flagged for creator review. If a creator hands off, you'll see a link to their Real Me thread.
      </p>

      {flags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You haven't flagged any chats yet.
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((f) => {
            const meta = STATUS_META[f.status] ?? STATUS_META.open;
            const Icon = meta.icon;
            return (
              <div key={f.id} className="rounded-2xl border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Flag className="size-4 text-brand-glow" />
                      <span className="font-semibold">{REASON_LABEL[f.reason] ?? f.reason}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.creator?.stage_name ? `@${f.creator.handle}` : "creator"}
                        {f.persona?.display_name && ` · ${f.persona.display_name}`}
                      </span>
                      <Badge variant="outline" className={"gap-1 text-[10px] uppercase " + meta.cls}>
                        <Icon className="size-3" /> {meta.label}
                      </Badge>
                    </div>
                    {f.note && <p className="mt-1.5 text-sm text-foreground/80">"{f.note}"</p>}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Flagged {new Date(f.created_at).toLocaleString()}
                      {f.resolved_at && ` · updated ${new Date(f.resolved_at).toLocaleString()}`}
                    </div>
                  </div>
                  {f.status === "handed_off" && f.creator?.handle && (
                    <Link
                      to="/chat/$handle/$persona"
                      params={{ handle: f.creator.handle, persona: "real-me" }}
                    >
                      <Button size="sm" variant="outline">
                        <MessageCircle className="mr-1 size-3.5" /> Open Real Me
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}