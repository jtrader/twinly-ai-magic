import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Heart, HeartOff, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { toggleFollow, setFavorite, getFollowState } from "@/lib/follows.functions";
import { useSession } from "@/lib/session";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";



export function FollowButton({ creatorId, compact = false }: { creatorId: string; compact?: boolean }) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const load = useServerFn(getFollowState);
  const toggle = useServerFn(toggleFollow);
  const fav = useServerFn(setFavorite);
  const [following, setFollowing] = useState(false);
  const [favorite, setFavoriteState] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    load({ data: { creatorId } })
      .then((r) => { setFollowing(r.following); setFavoriteState(r.favorite); })
      .catch(() => {});
  }, [user, creatorId]);

  const onFollow = async () => {
    if (!user) { navigate({ to: "/auth" }); return; }
    const prevFollowing = following;
    const prevFavorite = favorite;
    const nextFollowing = !following;
    // Optimistic: apply immediately. Unfollowing also drops favorite.
    setFollowing(nextFollowing);
    if (!nextFollowing) setFavoriteState(false);
    setFollowBusy(true);
    let undone = false;
    try {
      const r = await toggle({ data: { creatorId, follow: nextFollowing } });
      setFollowing(r.following); setFavoriteState(r.favorite);
      toast.success(r.following ? "Following" : "Unfollowed", {
        action: {
          label: "Undo",
          onClick: async () => {
            if (undone) return;
            undone = true;
            setFollowing(prevFollowing);
            setFavoriteState(prevFavorite);
            try {
              await toggle({ data: { creatorId, follow: prevFollowing, favorite: prevFavorite } });
            } catch { toast.error("Couldn't undo — please refresh"); }
          },
        },
        duration: 5000,
      });
    } catch (e: any) {
      setFollowing(prevFollowing);
      setFavoriteState(prevFavorite);
      toast.error(e?.message ?? "Couldn't update follow — try again");
    } finally { setFollowBusy(false); }
  };

  const onFav = async () => {
    if (!user) { navigate({ to: "/auth" }); return; }
    const prevFavorite = favorite;
    const prevFollowing = following;
    const nextFavorite = !favorite;
    // Optimistic: favoriting also follows.
    setFavoriteState(nextFavorite);
    if (nextFavorite) setFollowing(true);
    setFavBusy(true);
    let undone = false;
    try {
      const r = await fav({ data: { creatorId, favorite: nextFavorite } });
      setFollowing(r.following); setFavoriteState(r.favorite);
      toast.success(r.favorite ? "Added to favorites" : "Removed favorite", {
        action: {
          label: "Undo",
          onClick: async () => {
            if (undone) return;
            undone = true;
            setFavoriteState(prevFavorite);
            setFollowing(prevFollowing);
            try {
              if (prevFollowing) await fav({ data: { creatorId, favorite: prevFavorite } });
              else await toggle({ data: { creatorId, follow: false } });
            } catch { toast.error("Couldn't undo — please refresh"); }
          },
        },
        duration: 5000,
      });
    } catch (e: any) {
      setFavoriteState(prevFavorite);
      setFollowing(prevFollowing);
      toast.error(e?.message ?? "Couldn't update favorite — try again");
    } finally { setFavBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Button size={compact ? "sm" : "default"} disabled variant="default">
          <UserPlus className="mr-1 size-4" /> Follow · Free
        </Button>
        <Button size={compact ? "sm" : "default"} disabled variant="outline" aria-label="Add favorite" title="Add favorite">
          <HeartOff className="size-4" />
        </Button>
      </div>
    );
  }

  function ActionButton(props: ButtonProps) {
    if (user) {
      return <Button {...props} />;
    }
    const { onClick, ...rest } = props;
    return (
      <AuthPromptDialog title="Join Twinly.life to follow" description="Sign up or log in to follow this creator and save them to your favorites.">
        <Button {...rest} />
      </AuthPromptDialog>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ActionButton
        size={compact ? "sm" : "default"}
        variant={following ? "outline" : "default"}
        onClick={onFollow}
        disabled={followBusy}
      >
        {followBusy
          ? <Loader2 className="mr-1 size-4 animate-spin" />
          : following ? <UserCheck className="mr-1 size-4" /> : <UserPlus className="mr-1 size-4" />}
        {following ? "Following" : "Follow · Free"}
      </ActionButton>
      <ActionButton
        size={compact ? "sm" : "default"}
        variant={favorite ? "default" : "outline"}
        onClick={onFav}
        disabled={favBusy}
        aria-label={favorite ? "Remove favorite" : "Add favorite"}
        title={favorite ? "Remove favorite" : "Add favorite"}
      >
        {favBusy
          ? <Loader2 className="size-4 animate-spin" />
          : favorite
            ? <Heart className="size-4 fill-current" />
            : <HeartOff className="size-4" />}
      </ActionButton>
    </div>
  );
}