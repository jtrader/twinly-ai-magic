import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { supabase } from "@/integrations/supabase/client";
import { getInvitePreview, acceptPersonaInvite } from "@/lib/persona-invites.functions";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "You've been invited — Twinly.life" }, { name: "robots", content: "noindex" }] }),
});

type Preview = Awaited<ReturnType<typeof getInvitePreview>>;

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const loadPreview = useServerFn(getInvitePreview);
  const accept = useServerFn(acceptPersonaInvite);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await loadPreview({ data: { token } });
        if (!alive) return;
        if (!res) setNotFound(true); else setPreview(res);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [token, loadPreview]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  async function handleAccept() {
    if (!authed) {
      navigate({ to: "/auth", search: { redirect: `/invite/${token}` } as any });
      return;
    }
    setBusy(true);
    try {
      const res = await accept({ data: { token } });
      toast.success("Invite accepted");
      navigate({ to: "/chat/$handle/$persona", params: { handle: res.creatorHandle, persona: res.personaSlug } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading invite…</div></AppShell>;
  }

  if (notFound || !preview) {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">This invite link isn't valid.</p>
          <Link to="/discover" className="mt-4 inline-block text-sm text-brand-glow underline">Browse creators →</Link>
        </div>
      </AppShell>
    );
  }

  if (preview.status === "revoked") {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">This invite has been revoked by the creator.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="flex justify-center"><PersonaBadge kind={preview.persona.kind as any} /></div>
        <h1 className="mt-3 font-display text-2xl font-bold">You've been invited to {preview.persona.display_name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">by @{preview.creator.handle} · {preview.persona.disclosure_label}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          This persona is private — only shared with people the creator has personally invited.
        </p>
        <Button className="mt-6" onClick={handleAccept} disabled={busy}>
          {busy ? "Accepting…" : authed === false ? "Sign in to accept" : "Accept & start chatting"}
        </Button>
      </div>
    </AppShell>
  );
}
