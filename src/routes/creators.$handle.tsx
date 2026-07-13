import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaCard } from "@/components/twinly/PersonaCard";
import { IntroVideoDialog } from "@/components/twinly/IntroVideoDialog";
import { AiDisclosureBanner } from "@/components/twinly/AiDisclosureBanner";
import { ReportDialog } from "@/components/twinly/ReportDialog";
import { BlockButton } from "@/components/twinly/BlockButton";
import { FollowButton } from "@/components/twinly/FollowButton";
import { CreatorSubscribeButtons } from "@/components/twinly/CreatorSubscribeButtons";
import { TipButton } from "@/components/twinly/TipButton";
import { ShieldCheck, Rss } from "lucide-react";
import { PostComposer, PostFeed } from "@/components/twinly/PostFeed";
import { getCreatorPosts } from "@/lib/posts.functions";
import { listCreatorPollsPublic } from "@/lib/polls.functions";
import { PollCard } from "@/components/twinly/PollCard";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Sparkles, Star } from "lucide-react";

type ActiveTier = "base" | "plus" | "vip";
const TIER_BADGE: Record<ActiveTier, { label: string; Icon: typeof Star; className: string }> = {
  base: { label: "Base", Icon: Star, className: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
  plus: { label: "Plus", Icon: Sparkles, className: "bg-brand/15 text-brand-glow border-brand-glow/30" },
  vip: { label: "VIP", Icon: Crown, className: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
};

const loadCreator = createServerFn({ method: "GET" })
  .validator((d: { handle: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("id, user_id, handle, stage_name, bio, verification_status, onboarding_completed_at")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!creator) return null;
    const { data: profile } = await supabaseAdmin
      .from("profiles_public")
      .select("id, display_name, avatar_url")
      .eq("id", creator.user_id)
      .maybeSingle();
    const [{ data: personas }, { count: postCount }] = await Promise.all([
      supabaseAdmin
        .from("personas")
        .select("id, slug, display_name, description, kind, disclosure_label, price_cents, visibility, starts_at, ends_at, sort_order, is_explicit, cover_url, intro_video_asset_id")
        .eq("creator_id", creator.id)
        .in("visibility", ["public", "subscribers", "vip"])
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("creator_posts")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("is_removed", false),
    ]);

    // Cheap existence+approval check for the video-icon badge — the actual
    // signed URL is only minted on click, via getPersonaIntroVideoUrl.
    const introAssetIds = (personas ?? []).map((p: any) => p.intro_video_asset_id).filter(Boolean);
    let approvedIntroAssetIds = new Set<string>();
    if (introAssetIds.length) {
      const { data: introAssets } = await supabaseAdmin
        .from("content_assets")
        .select("id, approval_status")
        .in("id", introAssetIds);
      approvedIntroAssetIds = new Set((introAssets ?? []).filter((a: any) => a.approval_status === "approved").map((a: any) => a.id));
    }
    const personasWithIntro = (personas ?? []).map((p: any) => ({
      ...p,
      hasIntroVideo: !!p.intro_video_asset_id && approvedIntroAssetIds.has(p.intro_video_asset_id),
    }));

    return { creator, profile: profile ?? null, personas: personasWithIntro, postCount: postCount ?? 0 };
  });

export const Route = createFileRoute("/creators/$handle")({
  loader: ({ params }) => loadCreator({ data: { handle: params.handle } }),
  component: CreatorProfile,
});

function CreatorProfile() {
  const data = Route.useLoaderData();
  if (!data) return <AppShell><div className="py-20 text-center text-muted-foreground">Creator not found.</div></AppShell>;
  const { creator, profile, personas, postCount } = data;
  const avatarUrl = profile?.avatar_url ?? null;
  const { user } = useSession();
  const isOwner = !!user && user.id === creator.user_id;
  const [introVideoPersona, setIntroVideoPersona] = useState<{ slug: string; displayName: string } | null>(null);
  const [activeSub, setActiveSub] = useState<{ tier: ActiveTier; cancelAtPeriodEnd: boolean } | null>(null);
  useEffect(() => {
    if (!user || isOwner) { setActiveSub(null); return; }
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end, cancel_at_period_end")
        .eq("fan_id", user.id)
        .eq("creator_id", creator.id);
      const now = new Date();
      const rank: Record<string, number> = { base: 1, plus: 2, vip: 3 };
      let best: { tier: ActiveTier; cancelAtPeriodEnd: boolean } | null = null;
      for (const row of (data ?? []) as any[]) {
        const end = row.current_period_end ? new Date(row.current_period_end) : null;
        const stillValid = !end || end > now;
        if ((row.status === "active" || (row.status === "canceled" && stillValid)) && rank[row.tier]) {
          if (!best || rank[row.tier] > rank[best.tier]) {
            best = { tier: row.tier as ActiveTier, cancelAtPeriodEnd: !!row.cancel_at_period_end || row.status === "canceled" };
          }
        }
      }
      setActiveSub(best);
    })();
  }, [user, isOwner, creator.id]);
  const navigate = useNavigate();
  const visiblePersonas = (personas as any[]).filter((p) => {
    const now = Date.now();
    if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < now) return false;
    return true;
  });
  const [tab, setTab] = useState<"latest" | "experiences">(() => {
    if (postCount === 0 && visiblePersonas.length > 0) return "experiences";
    if (visiblePersonas.length === 0 && postCount > 0) return "latest";
    return "latest";
  });
  const [posts, setPosts] = useState<any[]>([]);
  const loadPosts = useServerFn(getCreatorPosts);
  const refreshPosts = async () => {
    try {
      const r = await loadPosts({ data: { handle: creator.handle, viewerId: user?.id ?? null } });
      setPosts(r.items ?? []);
    } catch {}
  };
  useEffect(() => { refreshPosts(); /* eslint-disable-line */ }, [creator.handle, user?.id]);

  // Standalone polls — not attached to any post — shown alongside the feed.
  const [standalonePolls, setStandalonePolls] = useState<any[]>([]);
  const loadStandalonePolls = useServerFn(listCreatorPollsPublic);
  const refreshStandalonePolls = async () => {
    try {
      const r = await loadStandalonePolls({ data: { handle: creator.handle, viewerId: user?.id ?? null } });
      setStandalonePolls(r.polls ?? []);
    } catch {}
  };
  useEffect(() => { refreshStandalonePolls(); /* eslint-disable-line */ }, [creator.handle, user?.id]);
  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold">{creator.stage_name}</h1>
            {creator.verification_status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-glow">
                <ShieldCheck className="size-3" /> Verified
              </span>
            )}
            {activeSub && (() => {
              const meta = TIER_BADGE[activeSub.tier];
              const Icon = meta.Icon;
              return (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.className}`}
                  title={activeSub.cancelAtPeriodEnd ? "Active until period end" : "Active subscription"}
                >
                  <Icon className="size-3" /> {meta.label} {activeSub.cancelAtPeriodEnd ? "· Ending" : "· Active"}
                </span>
              );
            })()}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">@{creator.handle}</div>
          {creator.bio && <p className="mt-2 text-sm text-muted-foreground">{creator.bio}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FollowButton creatorId={creator.id} compact />
            {!isOwner && <TipButton creatorId={creator.id} creatorName={creator.stage_name} />}
            <ReportDialog targetType="creator" targetId={creator.id} label="Report creator" variant="outline" />
            <BlockButton targetType="creator" targetId={creator.id} variant="outline" />
          </div>
          {!isOwner && (
            <CreatorSubscribeButtons creatorId={creator.id} creatorName={creator.stage_name} creatorAvatarUrl={avatarUrl} />
          )}
        </div>
        {avatarUrl && (
          <div className="relative shrink-0 self-center">
            <div className="absolute inset-0 rounded-full bg-brand-glow/40 blur-lg" aria-hidden />
            <img
              src={avatarUrl}
              alt={creator.stage_name}
              loading="lazy"
              className="relative size-24 rounded-full border-2 border-brand-glow/70 object-cover shadow-[0_0_24px_-2px_hsl(var(--brand-glow)/0.6)] sm:size-28"
            />
          </div>
        )}
      </div>
      <AiDisclosureBanner kind="ai" label="This creator uses official AI personas. All AI chats are clearly labeled." className="mb-6" />
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div role="tablist" aria-label="Profile sections" className="relative flex items-center gap-1 rounded-full bg-surface p-1 shadow-inner">
          <div
            className="absolute inset-y-1 rounded-full bg-gradient-to-r from-brand via-brand-glow to-ai shadow-[var(--shadow-brand-glow)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: "calc(50% - 0.375rem)",
              left: tab === "latest" ? "0.25rem" : "calc(50% + 0.125rem)",
            }}
            aria-hidden
          />
          {([
            { id: "latest", label: "Latest", Icon: Rss },
            { id: "experiences", label: "Experiences", Icon: Sparkles },
          ] as const).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={
                  "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors duration-300 " +
                  (active
                    ? "text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className={`size-4 transition-transform duration-300 ${active ? "scale-110" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "latest" ? (
        <section key="latest" className="animate-fade-in">
          {isOwner && (
            <div className="mb-4">
              <PostComposer creatorId={creator.id} onPosted={refreshPosts} />
            </div>
          )}
          <PostFeed
            posts={posts}
            emptyText={isOwner
              ? "You haven't posted yet. Share an update with your supporters."
              : "No posts yet."}
            onChanged={refreshPosts}
          />
          {standalonePolls.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Polls</div>
              {standalonePolls.map((p: any) => (
                <PollCard key={p.id} poll={p} onVoted={refreshStandalonePolls} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section key="experiences" className="animate-fade-in">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePersonas.map((p: any) => {
              const target = `/creators/${creator.handle}/${p.slug}`;
              const cardProps = user
                ? { href: target }
                : { onClick: () => navigate({ to: "/auth", search: { redirect: target } as any }) };
              return (
                <PersonaCard
                  key={p.id}
                  id={p.id}
                  slug={p.slug}
                  displayName={p.display_name}
                  description={p.description}
                  kind={p.kind}
                  disclosureLabel={p.disclosure_label}
                  priceCents={p.price_cents ?? 0}
                  avatarUrl={p.cover_url}
                  hasIntroVideo={p.hasIntroVideo}
                  onPlayIntro={() => setIntroVideoPersona({ slug: p.slug, displayName: p.display_name })}
                  {...cardProps}
                />
              );
            })}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            <Link to="/legal/ai-disclosure" className="underline">Learn how AI personas work →</Link>
          </p>
        </section>
      )}
      <IntroVideoDialog
        open={!!introVideoPersona}
        onOpenChange={(o) => { if (!o) setIntroVideoPersona(null); }}
        creatorHandle={creator.handle}
        personaSlug={introVideoPersona?.slug ?? null}
        displayName={introVideoPersona?.displayName}
        userId={user?.id ?? null}
      />
    </AppShell>
  );
}
