import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Heart, HeartOff, UserPlus, UserCheck } from "lucide-react";
import { toggleFollow, setFavorite, getFollowState } from "@/lib/follows.functions";
import { useSession } from "@/lib/session";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export function FollowButton({ creatorId, compact = false }: { creatorId: string; compact?: boolean }) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(getFollowState);
  const toggle = useServerFn(toggleFollow);
  const fav = useServerFn(setFavorite);
  const [following, setFollowing] = useState(false);
  const [favorite, setFavoriteState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    load({ data: { creatorId } })
      .then((r) => { setFollowing(r.following); setFavoriteState(r.favorite); })
      .catch(() => {});
  }, [user, creatorId]);

  const onFollow = async () => {
    if (!user) { navigate({ to: "/auth" }); return; }
    setBusy(true);
    try {
      const r = await toggle({ data: { creatorId, follow: !following } });
      setFollowing(r.following); setFavoriteState(r.favorite);
      toast.success(r.following ? "Following" : "Unfollowed");
    } catch (e: any) { toast.error(e?.message ?? "Try again"); }
    finally { setBusy(false); }
  };

  const onFav = async () => {
    if (!user) { navigate({ to: "/auth" }); return; }
    setBusy(true);
    try {
      const r = await fav({ data: { creatorId, favorite: !favorite } });
      setFollowing(r.following); setFavoriteState(r.favorite);
      toast.success(r.favorite ? "Added to favorites" : "Removed favorite");
    } catch (e: any) { toast.error(e?.message ?? "Try again"); }
    finally { setBusy(false); }
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size={compact ? "sm" : "default"}
        variant={following ? "outline" : "default"}
        onClick={onFollow}
        disabled={busy}
      >
        {following ? <UserCheck className="mr-1 size-4" /> : <UserPlus className="mr-1 size-4" />}
        {following ? "Following" : "Follow · Free"}
      </Button>
      <Button
        size={compact ? "sm" : "default"}
        variant={favorite ? "default" : "outline"}
        onClick={onFav}
        disabled={busy}
        aria-label={favorite ? "Remove favorite" : "Add favorite"}
        title={favorite ? "Remove favorite" : "Add favorite"}
      >
        {favorite
          ? <Heart className="size-4 fill-current" />
          : <HeartOff className="size-4" />}
      </Button>
    </div>
  );
}