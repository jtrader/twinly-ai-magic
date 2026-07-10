import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaCard } from "@/components/twinly/PersonaCard";
import { AiDisclosureBanner } from "@/components/twinly/AiDisclosureBanner";
import { ReportDialog } from "@/components/twinly/ReportDialog";
import { BlockButton } from "@/components/twinly/BlockButton";
import { FollowButton } from "@/components/twinly/FollowButton";
import { ShieldCheck, Rss } from "lucide-react";
import { PostComposer, PostFeed } from "@/components/twinly/PostFeed";
import { getCreatorPosts } from "@/lib/posts.functions";
import { useSession } from "@/lib/session";

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
    const { data: personas } = await supabaseAdmin
      .from("personas")
      .select("id, slug, display_name, description, kind, disclosure_label, price_cents, visibility, starts_at, ends_at, sort_order, is_explicit, cover_url")
      .eq("creator_id", creator.id)
      .in("visibility", ["public", "subscribers", "vip"])
      .order("sort_order", { ascending: true });
    return { creator, profile: profile ?? null, personas: personas ?? [] };
  });

export const Route = createFileRoute("/creators/$handle")({
  loader: ({ params }) => loadCreator({ data: { handle: params.handle } }),
  component: CreatorProfile,
});

function CreatorProfile() {
  const data = Route.useLoaderData();
  if (!data) return <AppShell><div className="py-20 text-center text-muted-foreground">Creator not found.</div></AppShell>;
  const { creator, profile, personas } = data;
  const avatarUrl = profile?.avatar_url ?? null;
  const { user } = useSession();
  const isOwner = !!user && user.id === creator.user_id;
  const [posts, setPosts] = useState<any[]>([]);
  const loadPosts = useServerFn(getCreatorPosts);
  const refreshPosts = async () => {
    try {
      const r = await loadPosts({ data: { handle: creator.handle } });
      setPosts(r.items ?? []);
    } catch {}
  };
  useEffect(() => { refreshPosts(); /* eslint-disable-line */ }, [creator.handle]);
  const now = Date.now();
  const visible = (personas as any[]).filter((p) => {
    if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < now) return false;
    return true;
  });
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
          </div>
          <div className="mt-1 text-sm text-muted-foreground">@{creator.handle}</div>
          {creator.bio && <p className="mt-2 text-sm text-muted-foreground">{creator.bio}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FollowButton creatorId={creator.id} compact />
            <ReportDialog targetType="creator" targetId={creator.id} label="Report creator" variant="outline" />
            <BlockButton targetType="creator" targetId={creator.id} variant="outline" />
          </div>
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
      <h2 className="mb-3 font-display text-xl font-semibold">Choose your experience</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
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
            href={`/creators/${creator.handle}/${p.slug}`}
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        <Link to="/legal/ai-disclosure" className="underline">Learn how AI personas work →</Link>
      </p>
    </AppShell>
  );
}