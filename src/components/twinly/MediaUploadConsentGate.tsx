import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  acknowledgeMediaUploadConsent,
  getMediaUploadConsent,
  MEDIA_UPLOAD_CONSENT_VERSION,
} from "@/lib/media-upload-consent.functions";

const LS_KEY = "twinly.mediaUploadConsent";

type Ctx = {
  /** Resolves true if the user has already (or now) accepted the media upload consent. */
  ensureConsent: (opts?: { context?: string }) => Promise<boolean>;
  hasConsent: boolean;
};

const MediaUploadConsentContext = createContext<Ctx | null>(null);

function readCached(): { at: string; version: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && v.version === MEDIA_UPLOAD_CONSENT_VERSION && v.at) return v;
  } catch {}
  return null;
}

function writeCached(at: string) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ at, version: MEDIA_UPLOAD_CONSENT_VERSION }));
  } catch {}
}

export function MediaUploadConsentProvider({ children }: { children: ReactNode }) {
  const [hasConsent, setHasConsent] = useState(false);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ctxLabel, setCtxLabel] = useState<string | undefined>(undefined);
  const pending = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage + server on auth changes.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const cached = readCached();
      if (cached) { setHasConsent(true); hydrated.current = true; return; }
      const { data } = await supabase.auth.getSession();
      if (!data.session) { hydrated.current = true; return; }
      try {
        const res = await getMediaUploadConsent();
        if (cancelled) return;
        if (res.acceptedAt && res.version === MEDIA_UPLOAD_CONSENT_VERSION) {
          writeCached(res.acceptedAt);
          setHasConsent(true);
        }
      } catch {}
      hydrated.current = true;
    }
    hydrate();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setHasConsent(false); return; }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") hydrate();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const ensureConsent = useCallback((opts?: { context?: string }) => {
    if (hasConsent) return Promise.resolve(true);
    setCtxLabel(opts?.context);
    setChecked(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current = { resolve };
    });
  }, [hasConsent]);

  const resolvePending = (value: boolean) => {
    const p = pending.current;
    pending.current = null;
    if (p) p.resolve(value);
  };

  async function onAccept() {
    if (!checked || busy) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Not signed in — cache locally so the flow can continue; server ack happens post-login.
        const at = new Date().toISOString();
        writeCached(at);
        setHasConsent(true);
        setOpen(false);
        resolvePending(true);
        return;
      }
      const res = await acknowledgeMediaUploadConsent({ data: { context: ctxLabel } });
      writeCached(res.acceptedAt);
      setHasConsent(true);
      setOpen(false);
      resolvePending(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record consent. Please try again.");
      resolvePending(false);
    } finally {
      setBusy(false);
    }
  }

  function onCancel() {
    setOpen(false);
    resolvePending(false);
  }

  const value = useMemo<Ctx>(() => ({ ensureConsent, hasConsent }), [ensureConsent, hasConsent]);

  return (
    <MediaUploadConsentContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Media Upload Consent</DialogTitle>
            <DialogDescription>
              Before uploading photos, audio, video, or other media for AI interpretation, please confirm the following. You'll only be asked once.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border bg-surface-elevated p-3 text-xs text-muted-foreground">
            <label className="flex items-start gap-2 text-foreground">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                className="mt-0.5"
                aria-label="I confirm the media upload consent"
              />
              <span>
                I confirm that I am 18 or older, I have the right to upload this photograph, audio,
                video, or other media, and the media does not show, record, or feature any child,
                non-consenting person, unlawful content, private/intimate material, or hidden-recording
                content. I consent to Twinly using the media for AI interpretation, media analysis,
                safety checks, service operation, and related processing described in the{" "}
                <Link to="/legal/privacy" className="underline">Privacy Policy</Link> and{" "}
                <Link to="/legal/biometric" className="underline">
                  Biometric, Facial and Voice Data Consent Notice
                </Link>
                . I understand I can withdraw consent or request deletion where available, subject to
                legal, safety, audit, and compliance retention requirements.
              </span>
            </label>
            <p className="mt-3">
              This consent does not authorise voice cloning, persona creation, synthetic likeness
              generation, explicit-content generation, or use of another person's identity — those
              require their own separate consent flows. See the full{" "}
              <Link to="/legal/media-upload-consent" className="underline">Media Upload Consent Notice</Link>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button onClick={onAccept} disabled={!checked || busy}>
              {busy ? "Saving…" : "Continue and upload media"}
            </Button>
          </DialogFooter>
          {!checked && (
            <p className="text-[11px] text-destructive">
              You must confirm the media upload consent before continuing.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </MediaUploadConsentContext.Provider>
  );
}

export function useMediaUploadConsent(): Ctx {
  const ctx = useContext(MediaUploadConsentContext);
  if (!ctx) {
    // Safe fallback so components don't crash outside the provider (dev/tests).
    return { hasConsent: false, ensureConsent: async () => true };
  }
  return ctx;
}