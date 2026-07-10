import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Heart, UserMinus, ExternalLink, Loader2, Check } from "lucide-react";
import { listMyFollows, toggleFollow, setFavorite } from "@/lib/follows.functions";

export const Route = createFileRoute("/account/following")({ component: FollowingPage });

type Row = Awaited<ReturnType<typeof listMyFollows>>[number];

function FollowingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [unfollowBusy, setUnfollowBusy] = useState<Set<string>>(new Set());
  const [favBusy, setFavBusy] = useState<Set<string>>(new Set());
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
    if (!confirm("Unfollow this creator?")) return;
    // Optimistic: drop the row immediately, restore on error.
    const snapshot = rows;
    setRows((s) => s.filter((r) => r.creatorId !== creatorId));
    withBusy(setUnfollowBusy, creatorId, true);
    try {
      await toggle({ data: { creatorId, follow: false } });
      toast.success("Unfollowed");
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
    try {
      await favorite({ data: { creatorId, favorite: next } });
    } catch (e: any) {
      setRows((s) => s.map((r) => r.creatorId === creatorId ? { ...r, favorite: !next } : r));
      toast.error(e?.message ?? "Couldn't update favorite — try again");
    } finally {
      withBusy(setFavBusy, creatorId, false);
    }
  }

  const favorites = useMemo(() => rows.filter((r) => r.favorite), [rows]);
  const following = useMemo(() => rows.filter((r) => !r.favorite), [rows]);

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
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
              <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{rows.length}</span></TabsTrigger>
              <TabsTrigger value="favorites">Favorites <span className="ml-1.5 text-xs text-muted-foreground">{favorites.length}</span></TabsTrigger>
              <TabsTrigger value="following">Following <span className="ml-1.5 text-xs text-muted-foreground">{following.length}</span></TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <RowList rows={rows} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />
            </TabsContent>
            <TabsContent value="favorites" className="mt-4">
              {favorites.length === 0
                ? <EmptyHint text="No favorites yet — tap the heart on anyone you follow." />
                : <RowList rows={favorites} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
            </TabsContent>
            <TabsContent value="following" className="mt-4">
              {following.length === 0
                ? <EmptyHint text="Everyone you follow is favorited." />
                : <RowList rows={following} unfollowBusy={unfollowBusy} favBusy={favBusy} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
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