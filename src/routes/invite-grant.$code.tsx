import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getInviteGrantPreview, redeemInviteGrant } from "@/lib/invite-grants.functions";

export const Route = createFileRoute("/invite-grant/$code")({
  component: RedeemInviteGrantPage,
  head: () => ({
    meta: [
      { title: "Redeem supporter invite — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Preview = Awaited<ReturnType<typeof getInviteGrantPreview>>;

function RedeemInviteGrantPage() {
  const { code } = useParams({ from: "/invite-grant/$code" });
  const navigate = useNavigate();
  const load = useServerFn(getInviteGrantPreview);
  const redeem = useServerFn(redeemInviteGrant);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    load({ data: { code } })
      .then((r) => setPreview(r))
      .catch((e: any) => toast.error(e?.message ?? "Could not load invite"))
      .finally(() => setReady(true));
  }, [code, load]);

  async function onRedeem() {
    if (!authed) { navigate({ to: "/auth" }); return; }
    setBusy(true);
    try {
      const r = await redeem({ data: { code } });
      toast.success("Access granted");
      navigate({ to: "/creators/$handle/$persona", params: { handle: r.creatorHandle, persona: r.personaSlug } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not redeem invite");
    } finally { setBusy(false); }
  }

  if (!ready) return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading invite…</div></AppShell>;
  if (!preview) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Invite not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">Double-check the link — it may have been mistyped.</p>
        </div>
      </AppShell>
    );
  }

  const { status, persona, creator, expiresAt } = preview;

  return (
    <AppShell>
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-brand-glow">
            <ShieldCheck className="size-4" /> Supporter invite
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold">
            {creator.stage_name || `@${creator.handle}`}
          </h1>
          <p className="text-sm text-muted-foreground">invited you to <span className="font-semibold text-foreground">{persona.display_name}</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{persona.disclosure_label}</p>
          {persona.requires_verified_supporter && (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              This persona is verified-supporter only. You'll need to complete identity verification (~3 minutes via Stripe) before redemption. Twinly never stores your ID.
            </div>
          )}
          {status !== "available" && (
            <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
              {status === "revoked" && "This invite has been revoked by the creator."}
              {status === "expired" && "This invite has expired."}
              {status === "exhausted" && "This invite has already been fully used."}
            </div>
          )}
          {status === "available" && expiresAt && (
            <p className="mt-4 text-xs text-muted-foreground">Expires {new Date(expiresAt).toLocaleString()}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={onRedeem} disabled={busy || status !== "available"}>
              {busy ? "Redeeming…" : authed === false ? "Sign in to redeem" : "Redeem invite"}
            </Button>
            <Link to="/discover">
              <Button variant="ghost">Browse other creators</Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}