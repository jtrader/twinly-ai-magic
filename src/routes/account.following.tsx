import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Heart, UserMinus, ExternalLink, Loader2, Check, Search, X } from "lucide-react";
import { listMyFollows, toggleFollow, setFavorite } from "@/lib/follows.functions";

type TabKey = "all" | "favorites" | "following";
const TABS: TabKey[] = ["all", "favorites", "following"];
const STORAGE_KEY = "account.following.tab";

export const Route = createFileRoute("/account/following")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" && TABS.includes(s.tab as TabKey) ? (s.tab as TabKey) : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: FollowingPage,
});

type Row = Awaited<ReturnType<typeof listMyFollows>>[number];

function FollowingPage() {
  const search = useSearch({ from: "/account/following" }) as { tab?: TabKey; q?: string };
  const navigate = useNavigate({ from: "/account/following" });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [unfollowBusy, setUnfollowBusy] = useState<Set<string>>(new Set());
  const [favBusy, setFavBusy] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>(() => {
    if (search.tab) return search.tab;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && TABS.includes(stored as TabKey)) return stored as TabKey;
    }
    return "all";
  });
  const [query, setQuery] = useState<string>(search.q ?? "");
  const load = useServerFn(listMyFollows);
  const toggle = useServerFn(toggleFollow);
  const favorite = useServerFn(setFavorite);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRows(await load()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  // Sync tab + search to URL and localStorage.
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, tab); } catch { /* ignore */ }
    navigate({
      search: (prev: any) => ({
        ...prev,
        tab: tab === "all" ? undefined : tab,
        q: query.trim() ? query.trim() : undefined,
      }),
      replace: true,
    });
  }, [tab, query, navigate]);

  const withBusy = (
    set: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    on: boolean,
  ) => set((s) => {
    const n = new Set(s);
    if (on) n.add(id); else n.delete(id);
    return n;
  });

  async function doUnfollow(creatorId: string) {
    // Optimistic: drop the row immediately, restore on error.
    const snapshot = rows;
    const removed = rows.find((r) => r.creatorId === creatorId);
    setRows((s) => s.filter((r) => r.creatorId !== creatorId));
    withBusy(setUnfollowBusy, creatorId, true);
    let reverted = false;
    try {
      await toggle({ data: { creatorId, follow: false } });
      toast.success(`Unfollowed ${removed?.stageName ?? removed?.handle ?? "creator"}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            if (reverted) return;
            reverted = true;
            setRows(snapshot);
            try {
              await toggle({ data: { creatorId, follow: true, favorite: !!removed?.favorite } });
              toast.success("Restored");
            } catch {
              toast.error("Couldn't undo — please refresh");
            }
          },
        },
        duration: 6000,
      });
    } catch (e: any) {
      setRows(snapshot);
      toast.error(e?.message ?? "Couldn't unfollow — try again");
    } finally {
      withBusy(setUnfollowBusy, creatorId, false);
    }
  }

  async function doToggleFav(creatorId: string, next: boolean) {
    // Optimistic flip so the tabs/counts update instantly.
    setRows((s) => s.map((r) => r.creatorId === creatorId ? { ...r, favorite: next } : r));
    withBusy(setFavBusy, creatorId, true);
    let reverted = false;
    try {
      await favorite({ data: { creatorId, favorite: next } });
      toast.success(next ? "Added to favorites" : "Removed from favorites", {
        action: {
          label: "Undo",
          onClick: async () => {
            if (reverted) return;
            reverted = true;
            setRows((s) => s.map((r) => r.creatorId === creatorId ? { ...r, favorite: !next } : r));
            try {
              await favorite({ data: { creatorId, favorite: !next } });
            } catch {
              toast.error("Couldn't undo — please refresh");
            }
          },
        },
        duration: 5000,
      });
    } catch (e: any) {
      setRows((s) => s.map((r) => r.creatorId === creatorId ? { ...r, favorite: !next } : r));
      toast.error(e?.message ?? "Couldn't update favorite — try again");
    } finally {
      withBusy(setFavBusy, creatorId, false);
    }
  }

  const favorites = useMemo(() => rows.filter((r) => r.favorite), [rows]);
  const following = useMemo(() => rows.filter((r) => !r.favorite), [rows]);

  const q = query.trim().toLowerCase();
  const filterRows = (list: Row[]) =>
    q.length === 0
      ? list
      : list.filter((r) =>
          (r.stageName ?? "").toLowerCase().includes(q) ||
          (r.handle ?? "").toLowerCase().includes(q) ||
          (r.bio ?? "").toLowerCase().includes(q),
        );
  const shownAll = filterRows(rows);
  const shownFavorites = filterRows(favorites);
  const shownFollowing = filterRows(following);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Following & Favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Creators you follow and the ones you've starred.</p>
      </header>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-8 text-center">
          <Heart className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">You're not following anyone yet</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/discover">Discover creators</Link>
          </Button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-6">
          <AvatarGrid rows={rows} favBusy={favBusy} onToggleFav={doToggleFav} />

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your creators by name, handle, or bio…"
              className="pl-9 pr-9"
              aria-label="Search creators"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-surface-elevated"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
              <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{q ? `${shownAll.length}/${rows.length}` : rows.length}</span></TabsTrigger>
              <TabsTrigger value="favorites">Favorites <span className="ml-1.5 text-xs text-muted-foreground">{q ? `${shownFavorites.length}/${favorites.length}` : favorites.length}</span></TabsTrigger>
              <TabsTrigger value="following">Following <span className="ml-1.5 text-xs text-muted-foreground">{q ? `${shownFollowing.length}/${following.length}` : following.length}</span></TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              {shownAll.length === 0
                ? <EmptyHint text={q ? `No matches for "${query}".` : "Nothing here yet."} />
                : <RowList rows={shownAll} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
            </TabsContent>
            <TabsContent value="favorites" className="mt-4">
              {shownFavorites.length === 0
                ? <EmptyHint text="No favorites yet — tap the heart on anyone you follow." />
                : <RowList rows={shownFavorites} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
            </TabsContent>
            <TabsContent value="following" className="mt-4">
              {shownFollowing.length === 0
                ? <EmptyHint text="Everyone you follow is favorited." />
                : <RowList rows={shownFollowing} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border bg-surface/40 p-4 text-sm text-muted-foreground">{text}</p>;
}

function AvatarThumb({ row }: { row: Row }) {
  const initial = (row.stageName ?? row.handle ?? "?").slice(0, 1).toUpperCase();
  if (row.avatarUrl) {
    return <img src={row.avatarUrl} alt={row.stageName ?? row.handle ?? ""} className="size-full object-cover" />;
  }
  return (
    <div className="flex size-full items-center justify-center bg-brand/15 text-sm font-semibold text-brand-glow">
      {initial}
    </div>
  );
}

function AvatarGrid({ rows, favBusy, onToggleFav }: {
  rows: Row[];
  favBusy: Set<string>;
  onToggleFav: (id: string, next: boolean) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick picks</h2>
        <p className="text-[11px] text-muted-foreground">Tap a face to favorite / unfavorite</p>
      </div>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
        {rows.map((r) => {
          const busy = favBusy.has(r.creatorId);
          return (
            <button
              key={r.creatorId}
              type="button"
              onClick={() => onToggleFav(r.creatorId, !r.favorite)}
              disabled={busy}
              aria-pressed={r.favorite}
              aria-label={`${r.favorite ? "Remove" : "Add"} favorite: ${r.stageName ?? r.handle}`}
              title={r.stageName ?? r.handle}
              className={
                "group relative aspect-square overflow-hidden rounded-2xl border-2 bg-surface transition-all disabled:opacity-70 " +
                (r.favorite
                  ? "border-brand shadow-[0_0_0_2px_hsl(var(--brand)/0.25)]"
                  : "border-border hover:border-brand/50")
              }
            >
              <AvatarThumb row={r} />
              <div className={
                "absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-white shadow " +
                (r.favorite ? "bg-brand" : "bg-black/50 opacity-0 group-hover:opacity-100")
              }>
                {busy
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : r.favorite ? <Check className="size-3.5" /> : <Heart className="size-3.5" />}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-left">
                <div className="truncate text-[10px] font-medium text-white">
                  {r.stageName ?? r.handle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RowList({ rows, unfollowBusy, favBusy, onUnfollow, onToggleFav }: {
  rows: Row[];
  unfollowBusy: Set<string>;
  favBusy: Set<string>;
  onUnfollow: (id: string) => void;
  onToggleFav: (id: string, next: boolean) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.creatorId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-10 overflow-hidden rounded-full">
              <AvatarThumb row={r} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{r.stageName ?? r.handle}</span>
                {r.verified && <Badge variant="secondary" className="text-[10px]">Verified</Badge>}
                {r.favorite && <Badge className="bg-brand/20 text-brand-glow text-[10px]">Favorite</Badge>}
              </div>
              {r.bio && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.bio}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={favBusy.has(r.creatorId)}
              onClick={() => onToggleFav(r.creatorId, !r.favorite)}
              aria-label={r.favorite ? "Remove favorite" : "Add favorite"}
              title={r.favorite ? "Remove favorite" : "Add favorite"}
            >
              {favBusy.has(r.creatorId)
                ? <Loader2 className="size-4 animate-spin" />
                : r.favorite
                  ? <Heart className="size-4 fill-brand-glow text-brand-glow" />
                  : <Heart className="size-4" />}
            </Button>
            {r.handle && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/creators/$handle" params={{ handle: r.handle }}><ExternalLink className="size-3.5" /></Link>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={unfollowBusy.has(r.creatorId)} onClick={() => onUnfollow(r.creatorId)}>
              {unfollowBusy.has(r.creatorId)
                ? <Loader2 className="mr-1 size-3.5 animate-spin" />
                : <UserMinus className="mr-1 size-3.5" />}
              {unfollowBusy.has(r.creatorId) ? "Unfollowing…" : "Unfollow"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}