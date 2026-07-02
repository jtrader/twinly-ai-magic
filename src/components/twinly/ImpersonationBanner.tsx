import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const RETURN_KEY = "twinly:adminReturnUrl";
const ADMIN_EMAIL_KEY = "twinly:adminReturnEmail";
const CREATOR_KEY = "twinly:impersonatingHandle";

export function setImpersonationContext(opts: { returnUrl: string | null; adminEmail: string | null; handle: string }) {
  if (typeof window === "undefined") return;
  if (opts.returnUrl) window.localStorage.setItem(RETURN_KEY, opts.returnUrl);
  if (opts.adminEmail) window.localStorage.setItem(ADMIN_EMAIL_KEY, opts.adminEmail);
  window.localStorage.setItem(CREATOR_KEY, opts.handle);
}

function clearImpersonationContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RETURN_KEY);
  window.localStorage.removeItem(ADMIN_EMAIL_KEY);
  window.localStorage.removeItem(CREATOR_KEY);
}

export function ImpersonationBanner() {
  const [state, setState] = useState<{ returnUrl: string; adminEmail: string | null; handle: string | null; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const returnUrl = window.localStorage.getItem(RETURN_KEY);
    const adminEmail = window.localStorage.getItem(ADMIN_EMAIL_KEY);
    const handle = window.localStorage.getItem(CREATOR_KEY);
    if (!returnUrl) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      // Only show if the current session is NOT the admin's own account
      if (email && email === adminEmail) {
        clearImpersonationContext();
        return;
      }
      setState({ returnUrl, adminEmail, handle, email });
    });
  }, []);

  if (!state) return null;

  async function returnToAdmin() {
    if (!state) return;
    setBusy(true);
    const url = state.returnUrl;
    clearImpersonationContext();
    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    window.location.href = url;
  }

  return (
    <div className="sticky top-14 z-40 border-b border-amber-400/40 bg-amber-500/95 text-black">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-semibold">
        <span>
          Impersonating {state.handle ? `@${state.handle}` : "demo creator"}
          {state.email ? ` (${state.email})` : ""}
        </span>
        <button
          type="button"
          onClick={returnToAdmin}
          disabled={busy}
          className="rounded-md bg-black px-3 py-1.5 text-xs font-bold text-amber-300 shadow-sm hover:bg-black/80 disabled:opacity-60"
        >
          {busy ? "Returning…" : "← Return to admin"}
        </button>
      </div>
    </div>
  );
}