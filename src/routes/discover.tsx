import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/twinly/AppShell";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { Heart, Loader2, Search, ShieldCheck } from "lucide-react";
import comingSoon from "@/assets/creator-coming-soon.png.asset.json";
import { useSession } from "@/lib/session";
import { toggleFollow, listMyFollows } from "@/lib/follows.functions";
import { useNavigate } from "@tanstack/react-router";

const listCreators = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("creators")
    .select("id, handle, stage_name, bio, verification_status, avatar_url, cover_url")
    .not("onboarding_completed_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
});

export const Route = createFileRoute("/discover")({
  loader: () => listCreators(),
  component: Discover,
});

function Discover() {
  const creators = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const { user } = useSession();
  const navigate = useNavigate();
  const listFollowsFn = useServerFn(listMyFollows);
  const toggleFollowFn = useServerFn(toggleFollow);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setFollowed(new Set());
      return;
    }
    let cancelled = false;
    listFollowsFn()
      .then((rows) => {
        if (cancelled) return;
        setFollowed(new Set(rows.map((r) => r.creatorId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, listFollowsFn]);

  async function handleFollowClick(creatorId: string) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (pending.has(creatorId)) return;
    const isFollowing = followed.has(creatorId);
    setPending((prev) => new Set(prev).add(creatorId));
    try {
      await toggleFollowFn({ data: { creatorId, follow: !isFollowing } });
      setFollowed((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(creatorId);
        else next.add(creatorId);
        return next;
      });
    } catch {
      // no-op; leave state as-is
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(creatorId);
        return next;
      });
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((c: any) => {
      const name = (c.stage_name ?? "").toLowerCase();
      const handle = (c.handle ?? "").toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [creators, query]);
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Discover creators</h1>
        <p className="mt-1 text-sm text-muted-foreground">Verified creators. Real Me and official AI personas — always disclosed.</p>
      </div>
      <div className="mb-6">
        <label className="relative block">
          <span className="sr-only">Search creators by name or username</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @username"
            className="w-full rounded-2xl border border-border bg-surface pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:border-brand-glow focus:outline-none focus:ring-2 focus:ring-brand-glow/40"
          />
        </label>
        {query && (
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "match" : "matches"} for "{query}"
          </p>
        )}
      </div>
      {creators.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <div className="font-display text-xl font-semibold">No creators yet</div>
          <p className="mt-2 text-sm text-muted-foreground">Twinly.life is invite-only during preview. Verified creators launching soon.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <div className="font-display text-xl font-semibold">No creators match "{query}"</div>
          <p className="mt-2 text-sm text-muted-foreground">Try a different name or @username.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
          {filtered.map((c: any) => {
            const image = c.cover_url || c.avatar_url || comingSoon.url;
            const isFollowing = followed.has(c.id);
            const isPending = pending.has(c.id);
            return (
              <Link
                key={c.id}
                to="/creators/$handle"
                params={{ handle: c.handle }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-glow/60 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/40">
                  <img
                    src={image}
                    alt={`${c.stage_name} cover`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-95" />
                  {c.verification_status === "verified" && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-glow backdrop-blur">
                      <ShieldCheck className="size-3" /> Verified
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                    <div className="truncate font-display text-base font-semibold text-white drop-shadow sm:text-lg">{c.stage_name}</div>
                    <div className="truncate text-xs text-white/70">@{c.handle}</div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  {c.bio && <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{c.bio}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                    <PersonaBadge kind="real_me" />
                    <PersonaBadge kind="ai" />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFollowClick(c.id);
                    }}
                    disabled={isPending}
                    aria-pressed={isFollowing}
                    aria-label={isFollowing ? `Unfollow ${c.stage_name}` : `Follow ${c.stage_name}`}
                    className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                      isFollowing
                        ? "border-brand-glow/60 bg-brand-glow/15 text-brand-glow hover:bg-brand-glow/25"
                        : "border-border bg-surface-elevated text-foreground hover:border-brand-glow/60 hover:text-brand-glow"
                    }`}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        <span>{isFollowing ? "Unfollowing…" : "Following…"}</span>
                      </>
                    ) : (
                      <>
                        <Heart className={`size-3.5 ${isFollowing ? "fill-current" : ""}`} aria-hidden="true" />
                        <span>{isFollowing ? "Following" : "Follow"}</span>
                      </>
                    )}
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}