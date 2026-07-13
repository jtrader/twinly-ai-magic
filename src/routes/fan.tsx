import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Sparkles, MessageCircle, ShieldCheck, Compass, Heart, Rss, CheckCircle2, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyFeed, listMyFollows, toggleFollow, setFavorite } from "@/lib/follows.functions";
import { PostFeed } from "@/components/twinly/PostFeed";
import { getHomeFeed } from "@/lib/posts.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { SupporterJourneyDialog } from "@/components/twinly/SupporterJourneyDialog";
import { toast } from "sonner";
import { DoorOpen, UserMinus, Users } from "lucide-react";

export const Route = createFileRoute("/fan")({
  component: FanDashboard,
  head: () => ({
    meta: [
      { title: "Your dashboard — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function FanDashboard() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<any[]>([]);
  const [convos, setConvos] = useState<any[]>([]);
  const [profile, setProfile] = useState<{ age_verified_at: string | null } | null>(null);
  const [profileInfo, setProfileInfo] = useState<Awaited<ReturnType<typeof getMyProfile>>["profile"]>(null);
  const [ready, setReady] = useState(false);
  const [feed, setFeed] = useState<any[]>([]);
  const [follows, setFollows] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [journey, setJourney] = useState<{ creatorId: string; creatorName: string; tier: "base" | "plus" | "vip" } | null>(null);
  const loadFeed = useServerFn(getMyFeed);
  const loadFollows = useServerFn(listMyFollows);
  const loadPosts = useServerFn(getHomeFeed);
  const loadProfile = useServerFn(getMyProfile);
  const unfollow = useServerFn(toggleFollow);
  const favorite = useServerFn(setFavorite);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
        supabase.from("subscriptions")
          .select("id, status, tier, current_period_end, creator_id, creators:creator_id(handle, stage_name)")
          .eq("fan_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("conversations")
          .select("id, last_message_at, persona_id, creator_id, personas:persona_id(display_name, kind, slug), creators:creator_id(handle, stage_name)")
          .eq("fan_id", user.id).order("last_message_at", { ascending: false }).limit(10),
        (supabase as any).rpc("get_my_profile_status"),
      ]);
      setSubs(s ?? []);
      setConvos(c ?? []);
      setProfile(Array.isArray(p) ? (p[0] ?? null) : (p ?? null));
      try {
        const [f, fol, ps, prof] = await Promise.all([
          loadFeed({}),
          loadFollows({}),
          loadPosts({ data: {} }).catch(() => ({ items: [] })),
          loadProfile().catch(() => ({ profile: null })),
        ]);
        setFeed(f.items ?? []);
        setFollows(fol ?? []);
        setPosts(ps.items ?? []);
        setProfileInfo(prof.profile);
      } catch {}
      setReady(true);
    })();
  }, [user]);

  const refreshPosts = async () => {
    try {
      const ps = await loadPosts({ data: {} });
      setPosts(ps.items ?? []);
    } catch {}
  };

  const refreshFollows = async () => {
    try {
      const fol = await loadFollows({});
      setFollows(fol ?? []);
    } catch {}
  };

  const onUnfollow = async (creatorId: string, name: string) => {
    try {
      await unfollow({ data: { creatorId, follow: false } });
      toast.success(`Unfollowed ${name}`);
      await Promise.all([refreshFollows(), refreshPosts()]);
    } catch (e: any) { toast.error(e?.message ?? "Try again"); }
  };

  const onToggleFavorite = async (creatorId: string, next: boolean) => {
    try {
      await favorite({ data: { creatorId, favorite: next } });
      await refreshFollows();
    } catch (e: any) { toast.error(e?.message ?? "Try again"); }
  };

  if (loading || !ready) {
    return <AppShell><div className="py-20 text-center text-muted-foreground">Loading…</div></AppShell>;
  }

  const profileComplete = !!profileInfo?.profile_completed_at;
  const ageVerified = !!profile?.age_verified_at;
  const onboardingSteps = [
    { key: "profile", label: "Complete your profile", done: profileComplete, cta: "/account/setup", ctaLabel: profileComplete ? "Edit" : "Continue" },
    { key: "age", label: "Verify your age (18+)", done: ageVerified, cta: "/account", ctaLabel: ageVerified ? "Manage" : "Verify" },
    { key: "personalise", label: "Personalise a creator experience", done: false, hint: subs.length === 0 ? "Subscribe to a creator to unlock this." : "Tap Personalise on a subscribed creator below." },
  ];
  const doneCount = onboardingSteps.filter((s) => s.done).length;
  const showChecklist = !profileComplete || !ageVerified;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Supporter dashboard</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Your Twinly</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>

      {showChecklist && (
        <section className="mb-6 rounded-2xl border border-brand/30 bg-brand/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg font-semibold text-brand-glow">Finish setting up your account</div>
              <p className="text-xs text-muted-foreground">{doneCount} of {onboardingSteps.length} done — takes about a minute.</p>
            </div>
            <Sparkles className="size-5 text-brand-glow" aria-hidden />
          </div>
          <ul className="mt-4 space-y-2">
            {onboardingSteps.map((s) => (
              <li key={s.key} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5">
                <CheckCircle2
                  className={"size-4 shrink-0 " + (s.done ? "text-emerald-400" : "text-muted-foreground/40")}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className={"text-sm " + (s.done ? "text-muted-foreground line-through" : "font-medium")}>{s.label}</div>
                  {s.hint && <div className="text-[11px] text-muted-foreground">{s.hint}</div>}
                </div>
                {s.cta && (
                  <Link to={s.cta as any}>
                    <Button size="sm" variant={s.done ? "ghost" : "default"}>
                      {s.ctaLabel} <ChevronRight className="ml-1 size-3.5" />
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active rooms" value={subs.filter((s) => s.status === "active").length} />
        <Stat label="Recent chats" value={convos.length} />
        <Stat label="Age verified" value={profile?.age_verified_at ? "Yes" : "No"} tone={profile?.age_verified_at ? "ok" : "warn"} />
        <Stat label="Following" value={follows.length} />
      </div>

      <section className="mb-8">
        <SectionHead icon={<Rss className="size-4 text-brand-glow" />} title="Feed · creators you follow" />
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          Following is free — you see every creator's public posts here. Paid content lives in <span className="font-semibold text-foreground">Rooms</span> below.
        </p>
        <PostFeed
          posts={posts}
          emptyText={follows.length === 0
            ? "Follow creators to see their posts here."
            : "Nothing new yet. Check back soon."}
          onChanged={refreshPosts}
        />
      </section>

      <section className="mb-6">
        <SectionHead icon={<Heart className="size-4 text-brand-glow" />} title="Your feed" />
        {feed.length === 0 ? (
          <EmptyRow text="Follow creators to build your feed." cta={{ to: "/discover", label: "Discover creators" }} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {feed.slice(0, 12).map((it) => (
              <Link
                key={it.personaId}
                to="/creators/$handle/$persona"
                params={{ handle: it.handle, persona: it.personaSlug }}
                className="block rounded-2xl border border-border bg-surface p-4 hover:border-brand/40 hover:bg-surface-elevated"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold">
                      {it.displayName}
                      {it.favorite && <Heart className="ml-1 inline size-3 fill-current text-brand-glow" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {it.stageName} · @{it.handle}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{it.kind === "ai" ? "AI" : "Real"}</Badge>
                </div>
                {it.disclosureLabel && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{it.disclosureLabel}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {follows.length > 0 && (
        <section className="mb-6">
          <SectionHead icon={<Users className="size-4 text-brand-glow" />} title="Following · Free" />
          <p className="-mt-1 mb-3 text-xs text-muted-foreground">
            Manage the creators whose free feed you receive. Favorites appear first everywhere.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {follows.map((f) => (
              <div key={f.creatorId} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold">
                      {f.stageName ?? "Creator"}
                      {f.favorite && <Heart className="ml-1 inline size-3 fill-current text-brand-glow" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">@{f.handle}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant={f.favorite ? "default" : "outline"}
                      onClick={() => onToggleFavorite(f.creatorId, !f.favorite)}
                      aria-label={f.favorite ? "Remove favorite" : "Favorite"}
                      title={f.favorite ? "Remove favorite" : "Favorite"}
                    >
                      <Heart className={"size-4 " + (f.favorite ? "fill-current" : "")} />
                    </Button>
                    {f.handle && (
                      <Link to="/creators/$handle" params={{ handle: f.handle }}>
                        <Button size="sm" variant="outline">Open</Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onUnfollow(f.creatorId, f.stageName ?? "creator")}
                      title="Unfollow"
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <SectionHead icon={<DoorOpen className="size-4 text-brand-glow" />} title="Rooms · Subscribed" />
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          Paid subscriptions unlock a creator's private Rooms — exclusive personas, packs and chats.
        </p>
        {subs.length === 0 ? (
          <EmptyRow text="No rooms yet. Subscribe to unlock exclusive content." cta={{ to: "/discover", label: "Discover creators" }} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subs.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold">{s.creators?.stage_name ?? "Creator"}</div>
                    <div className="truncate text-xs text-muted-foreground">@{s.creators?.handle}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{s.tier ?? "sub"} · {s.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.creators?.handle && (
                    <Link to="/creators/$handle" params={{ handle: s.creators.handle }}>
                      <Button size="sm" variant="outline">Open profile</Button>
                    </Link>
                  )}
                  {s.creator_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setJourney({
                          creatorId: s.creator_id,
                          creatorName: s.creators?.stage_name ?? "Creator",
                          tier: (["base", "plus", "vip"].includes(s.tier) ? s.tier : "base") as "base" | "plus" | "vip",
                        })
                      }
                    >
                      <Sparkles className="mr-1 size-3.5" />Personalise
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <SectionHead icon={<MessageCircle className="size-4 text-brand-glow" />} title="Recent chats" />
        {convos.length === 0 ? (
          <EmptyRow text="You haven't started any chats." cta={{ to: "/discover", label: "Find a persona" }} />
        ) : (
          <div className="space-y-2">
            {convos.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {c.personas?.display_name} <span className="ml-1 text-xs text-muted-foreground">· @{c.creators?.handle}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.personas?.kind === "ai" ? "AI persona" : "Real Me"} · {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
                  </div>
                </div>
                {c.creators?.handle && c.personas && (
                  <Link to="/chat/$handle/$persona" params={{ handle: c.creators.handle, persona: (c.personas as any).slug ?? c.persona_id }}>
                    <Button size="sm" variant="ghost">Open</Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead icon={<ShieldCheck className="size-4 text-brand-glow" />} title="Account" />
        <div className="grid gap-3 md:grid-cols-2">
          <Link to="/account"><Tile title="Account & age" desc="Manage profile, email, and 18+ status." /></Link>
          <Link to="/discover"><Tile title="Discover" desc="Browse verified creators and personas." icon={<Compass className="size-4 text-brand-glow" />} /></Link>
        </div>
      </section>

      {journey && (
        <SupporterJourneyDialog
          open={!!journey}
          onOpenChange={(open) => { if (!open) setJourney(null); }}
          creatorId={journey.creatorId}
          creatorName={journey.creatorName}
          tier={journey.tier}
          onComplete={() => {
            toast.success("Preferences saved — the creator's AI will use these next time.");
            setJourney(null);
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={"mt-1 font-display text-2xl font-bold " + cls}>{value}</div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <h2 className="font-display text-lg font-semibold">{title}</h2>
    </div>
  );
}

function EmptyRow({ text, cta }: { text: string; cta: { to: string; label: string } }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-dashed border-border bg-surface p-6">
      <div className="text-sm text-muted-foreground">{text}</div>
      <Link to={cta.to as any}><Button size="sm" variant="outline">{cta.label}</Button></Link>
    </div>
  );
}

function Tile({ title, desc, icon }: { title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 hover:border-brand/40 hover:bg-surface-elevated">
      <div className="flex items-center gap-2">{icon}<div className="font-display text-lg font-semibold">{title}</div></div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
