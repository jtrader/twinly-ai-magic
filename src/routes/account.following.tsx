import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Heart, HeartOff, UserMinus, ExternalLink } from "lucide-react";
import { listMyFollows, toggleFollow, setFavorite } from "@/lib/follows.functions";

export const Route = createFileRoute("/account/following")({ component: FollowingPage });

type Row = Awaited<ReturnType<typeof listMyFollows>>[number];

function FollowingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function doUnfollow(creatorId: string) {
    if (!confirm("Unfollow this creator?")) return;
    setBusyId(creatorId);
    try {
      await toggle({ data: { creatorId, follow: false } });
      setRows((s) => s.filter((r) => r.creatorId !== creatorId));
      toast.success("Unfollowed");
    } catch (e: any) { toast.error(e?.message ?? "Could not unfollow"); }
    finally { setBusyId(null); }
  }

  async function doToggleFav(creatorId: string, next: boolean) {
    setBusyId(creatorId);
    try {
      await favorite({ data: { creatorId, favorite: next } });
      setRows((s) => s.map((r) => r.creatorId === creatorId ? { ...r, favorite: next } : r));
    } catch (e: any) { toast.error(e?.message ?? "Could not update favorite"); }
    finally { setBusyId(null); }
  }

  const favorites = useMemo(() => rows.filter((r) => r.favorite), [rows]);
  const following = useMemo(() => rows.filter((r) => !r.favorite), [rows]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Following & Favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Creators you follow and the ones you've starred.</p>
      </header>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

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
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
            <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{rows.length}</span></TabsTrigger>
            <TabsTrigger value="favorites">Favorites <span className="ml-1.5 text-xs text-muted-foreground">{favorites.length}</span></TabsTrigger>
            <TabsTrigger value="following">Following <span className="ml-1.5 text-xs text-muted-foreground">{following.length}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <RowList rows={rows} busyId={busyId} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />
          </TabsContent>
          <TabsContent value="favorites" className="mt-4">
            {favorites.length === 0
              ? <EmptyHint text="No favorites yet — tap the heart on anyone you follow." />
              : <RowList rows={favorites} busyId={busyId} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
          </TabsContent>
          <TabsContent value="following" className="mt-4">
            {following.length === 0
              ? <EmptyHint text="Everyone you follow is favorited." />
              : <RowList rows={following} busyId={busyId} onUnfollow={doUnfollow} onToggleFav={doToggleFav} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border bg-surface/40 p-4 text-sm text-muted-foreground">{text}</p>;
}

function RowList({ rows, busyId, onUnfollow, onToggleFav }: {
  rows: Row[]; busyId: string | null; onUnfollow: (id: string) => void; onToggleFav: (id: string, next: boolean) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.creatorId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand-glow">
              {(r.stageName ?? r.handle ?? "?").slice(0, 1).toUpperCase()}
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
              disabled={busyId === r.creatorId}
              onClick={() => onToggleFav(r.creatorId, !r.favorite)}
              aria-label={r.favorite ? "Remove favorite" : "Add favorite"}
              title={r.favorite ? "Remove favorite" : "Add favorite"}
            >
              {r.favorite
                ? <Heart className="size-4 fill-brand-glow text-brand-glow" />
                : <Heart className="size-4" />}
            </Button>
            {r.handle && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/creators/$handle" params={{ handle: r.handle }}><ExternalLink className="size-3.5" /></Link>
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busyId === r.creatorId} onClick={() => onUnfollow(r.creatorId)}>
              <UserMinus className="mr-1 size-3.5" />
              {busyId === r.creatorId ? "…" : "Unfollow"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}