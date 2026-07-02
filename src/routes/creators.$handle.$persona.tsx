import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/twinly/AppShell";
import { AiDisclosureBanner } from "@/components/twinly/AiDisclosureBanner";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck, Image as ImageIcon, Video, Music, FileText, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPersonaFeed, getFanAssetUrl } from "@/lib/fan-feed.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/creators/$handle/$persona")({
  component: PersonaFeedPage,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} · ${params.persona} — Twinly.life` },
      { name: "description", content: `Explore the ${params.persona} persona from @${params.handle} on Twinly.life.` },
      { property: "og:title", content: `@${params.handle} · ${params.persona}` },
      { property: "og:description", content: `Verified creator persona on Twinly.life.` },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type FeedData = NonNullable<Awaited<ReturnType<typeof getPersonaFeed>>>;

function PersonaFeedPage() {
  const { handle, persona: personaSlug } = Route.useParams();
  const navigate = useNavigate();
  const load = useServerFn(getPersonaFeed);
  const [data, setData] = useState<FeedData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      try {
        const res = await load({ data: { handle, personaSlug, userId: userRes.user?.id ?? null } });
        if (!alive) return;
        if (!res) setNotFound(true);
        else setData(res);
      } catch (e: any) {
        if (alive) toast.error(e?.message ?? "Failed to load persona");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [handle, personaSlug, load]);

  if (!ready) {
    return <AppShell><div className="py-20 text-center text-sm text-muted-foreground">Loading persona…</div></AppShell>;
  }
  if (notFound || !data) {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">Persona not found or not public.</p>
          <Link to="/discover" className="mt-4 inline-block text-sm text-brand-glow underline">Browse creators →</Link>
        </div>
      </AppShell>
    );
  }

  const { creator, persona, viewer, items } = data;
  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/creators/$handle" params={{ handle: creator.handle }} className="hover:text-foreground">@{creator.handle}</Link>
          <span>/</span>
          <span>{persona.slug}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold">{persona.displayName}</h1>
              <PersonaBadge kind={persona.kind} />
              {creator.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-glow">
                  <ShieldCheck className="size-3" /> Verified
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{persona.disclosureLabel}</div>
            {persona.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{persona.description}</p>}
          </div>
          <div className="flex gap-2">
            <Link to="/chat/$handle/$persona" params={{ handle: creator.handle, persona: persona.slug }}>
              <Button><MessageCircle className="mr-2 size-4" />Chat</Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Badge variant="outline" className="border-border">{persona.visibility}</Badge>
          {persona.isExplicit && <Badge variant="outline" className="border-rose-400/40 bg-rose-400/10 text-rose-300">18+</Badge>}
          {persona.priceCents > 0 && <Badge variant="outline">${(persona.priceCents / 100).toFixed(2)}</Badge>}
        </div>
      </div>

      {persona.kind === "ai" && (
        <AiDisclosureBanner kind="ai" label={persona.disclosureLabel} className="mb-6" />
      )}
      {persona.isExplicit && !viewer.isAdult && (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
          This persona contains 18+ content. Confirm your age from your account to unlock media.
        </div>
      )}
      {persona.visibility !== "public" && !viewer.subTier && (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand/10 p-3 text-xs text-brand-glow">
          {viewer.isAuthed ? "Subscribe to unlock this persona's feed." : "Sign in and subscribe to unlock this persona's feed."}
        </div>
      )}

      <h2 className="mb-3 font-display text-xl font-semibold">Feed</h2>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-6 w-6" />
          Nothing published yet. Check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <FeedTile
              key={it.id}
              item={it}
              onNeedAuth={() => navigate({ to: "/auth" })}
              onNeedAge={() => navigate({ to: "/account" })}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        <Link to="/legal/ai-disclosure" className="underline">How AI personas work →</Link>
      </p>
    </AppShell>
  );
}

function typeIcon(t: string) {
  if (t === "image") return ImageIcon;
  if (t === "video") return Video;
  if (t === "audio") return Music;
  return FileText;
}

function FeedTile({ item, onNeedAuth, onNeedAge }: {
  item: FeedData["items"][number];
  onNeedAuth: () => void;
  onNeedAge: () => void;
}) {
  const [url, setUrl] = useState<string | null>(item.externalUrl);
  const [loading, setLoading] = useState(false);
  const sign = useServerFn(getFanAssetUrl);
  const Icon = typeIcon(item.assetType);
  const open = item.access.state === "open";

  useEffect(() => {
    if (!open || url || !item.hasMedia) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { url: signed } = await sign({ data: { assetId: item.id } });
        if (alive) setUrl(signed);
      } catch {
        /* keep placeholder */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, item.id, item.hasMedia, url, sign]);

  const lockLabel = !open && item.access.state === "locked" ? (
    item.access.reason === "sign_in" ? "Sign in to view"
    : item.access.reason === "age_gate" ? "18+ · verify age"
    : item.access.reason === "vip" ? "VIP only"
    : item.access.reason === "subscribe" ? "Subscribers only"
    : item.access.reason === "ppv" ? `Unlock $${((item.access.priceCents ?? item.priceCents) / 100).toFixed(2)}`
    : "Restricted"
  ) : null;

  function handleLockedClick() {
    if (item.access.state !== "locked") return;
    if (item.access.reason === "sign_in") onNeedAuth();
    else if (item.access.reason === "age_gate") onNeedAge();
    else if (item.access.reason === "ppv") toast.info("Pay-per-view unlock coming soon.");
    else toast.info("Subscribe on the creator profile to unlock.");
  }

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-surface"
      onClick={handleLockedClick}
      role={!open ? "button" : undefined}
    >
      <div className="relative aspect-square w-full bg-background/40">
        {open && url && item.assetType === "image" && (
          <img src={url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        )}
        {open && url && item.assetType === "video" && (
          <video src={url} className="h-full w-full object-cover" controls playsInline preload="metadata" />
        )}
        {open && url && item.assetType === "audio" && (
          <div className="flex h-full w-full items-center justify-center p-3">
            <audio src={url} controls className="w-full" />
          </div>
        )}
        {(!open || (!url && !loading)) && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            {!open ? <Lock className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
            {lockLabel && <span className="px-2 text-center text-[11px] font-medium">{lockLabel}</span>}
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">Loading…</div>
        )}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          <Badge variant="outline" className="border-border/70 bg-background/70 text-[9px] uppercase tracking-widest">
            <Icon className="mr-1 h-3 w-3" />{item.assetType}
          </Badge>
          {item.aiDisclosureRequired && (
            <Badge variant="outline" className="border-brand/40 bg-brand/10 text-[9px] uppercase tracking-widest text-brand-glow">AI</Badge>
          )}
        </div>
      </div>
      <div className="p-2">
        <div className="line-clamp-1 text-xs font-medium">{item.title}</div>
        {item.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full border border-border bg-background/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}