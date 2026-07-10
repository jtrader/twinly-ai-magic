import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Ban, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  blockCreator, unblockCreator, isBlockingCreator, blockUserId, unblockUserId, isBlockingUserId,
} from "@/lib/blocks.functions";
import { useSession } from "@/lib/session";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";


type Target = "creator" | "fan";

export function BlockButton({
  targetType,
  targetId,
  size = "sm",
  variant = "ghost",
}: {
  targetType: Target;
  targetId?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
}) {
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useSession();

  const doBlock = useServerFn(targetType === "creator" ? blockCreator : blockUserId);
  const doUnblock = useServerFn(targetType === "creator" ? unblockCreator : unblockUserId);
  const doCheck = useServerFn(targetType === "creator" ? isBlockingCreator : isBlockingUserId);

  useEffect(() => {
    if (!targetId || !user) return;
    const payload = targetType === "creator" ? { creatorId: targetId } : { userId: targetId };
    doCheck({ data: payload as any })
      .then((r) => setBlocking(r.blocking))
      .catch(() => {});
    // eslint-disable-next-line
  }, [targetId, targetType, user]);

  if (!targetId) return null;

  if (loading) {
    return (
      <Button type="button" size={size} variant={variant} className="gap-1.5" disabled>
        <Ban className="size-3.5" /> Block
      </Button>
    );
  }

  if (!user) {
    return (
      <AuthPromptDialog title="Join Twinly to block" description="Sign up or log in to manage who you interact with.">
        <Button type="button" size={size} variant={variant} className="gap-1.5">
          <Ban className="size-3.5" /> Block
        </Button>
      </AuthPromptDialog>
    );
  }

  async function confirmBlock() {

    if (!user) {
      toast.error("Sign in to block users.");
      return;
    }
    setBusy(true);
    try {
      const payload = targetType === "creator" ? { creatorId: targetId } : { userId: targetId };
      await doBlock({ data: payload as any });
      setBlocking(true);
      setOpen(false);
      toast.success(targetType === "creator" ? "Creator blocked" : "User blocked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not block");
    } finally {
      setBusy(false);
    }
  }

  async function unblock() {
    if (!user) {
      toast.error("Sign in to unblock users.");
      return;
    }
    setBusy(true);
    try {
      const payload = targetType === "creator" ? { creatorId: targetId } : { userId: targetId };
      await doUnblock({ data: payload as any });
      setBlocking(false);
      toast.success("Unblocked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unblock");
    } finally {
      setBusy(false);
    }
  }

  if (blocking) {
    return (
      <Button type="button" size={size} variant={variant} className="gap-1.5" onClick={unblock} disabled={busy}>
        <ShieldOff className="size-3.5" /> {busy ? "…" : "Unblock"}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size={size} variant={variant} className="gap-1.5">
          <Ban className="size-3.5" /> Block
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{targetType === "creator" ? "Block this creator?" : "Block this fan?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {targetType === "creator"
              ? "You won't be able to message this creator or their AI personas, and they won't be able to message you. You can unblock any time."
              : "This fan won't be able to message you or your AI personas, and you won't be able to reply to them. You can unblock any time."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={confirmBlock}>
            {busy ? "Blocking…" : "Block"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
