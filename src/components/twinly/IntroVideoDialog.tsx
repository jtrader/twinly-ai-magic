import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getPersonaIntroVideoUrl } from "@/lib/fan-feed.functions";

export interface IntroVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorHandle: string;
  personaSlug: string | null;
  displayName?: string;
  userId?: string | null;
}

/**
 * Lightbox for a persona's intro-video teaser. Built on the shared Dialog
 * primitive — its built-in close button already renders top-right
 * (components/ui/dialog.tsx), so no custom close control is needed here.
 * Native <video controls> satisfies "standard overlay play/stop controls"
 * without a hand-rolled control bar.
 */
export function IntroVideoDialog({ open, onOpenChange, creatorHandle, personaSlug, displayName, userId }: IntroVideoDialogProps) {
  const getUrl = useServerFn(getPersonaIntroVideoUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !personaSlug) {
      setUrl(null);
      setError(null);
      return;
    }
    let alive = true;
    getUrl({ data: { handle: creatorHandle, personaSlug, userId } })
      .then((r) => {
        if (!alive) return;
        if (r?.url) setUrl(r.url);
        else setError("This intro video isn't available right now.");
      })
      .catch(() => { if (alive) setError("This intro video isn't available right now."); });
    return () => { alive = false; };
  }, [open, personaSlug, creatorHandle, userId, getUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden border-none bg-black p-0 sm:rounded-2xl">
        <div className="flex aspect-[9/16] items-center justify-center bg-black">
          {url ? (
            <video
              controls
              autoPlay
              playsInline
              src={url}
              className="h-full w-full"
              aria-label={displayName ? `${displayName} intro video` : "Persona intro video"}
            />
          ) : error ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
