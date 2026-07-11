import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const RETURN_KEY = "twinly:adminReturnUrl";
const ADMIN_EMAIL_KEY = "twinly:adminReturnEmail";
const CREATOR_KEY = "twinly:impersonatingHandle";
const KIND_KEY = "twinly:impersonatingKind";
const TARGET_NAME_KEY = "twinly:impersonatingName";

export function setImpersonationContext(opts: {
  returnUrl: string | null;
  adminEmail: string | null;
  handle: string;
  kind?: "creator" | "agency" | "user";
  targetName?: string | null;
}) {
  if (typeof window === "undefined") return;
  if (opts.returnUrl) window.localStorage.setItem(RETURN_KEY, opts.returnUrl);
  if (opts.adminEmail) window.localStorage.setItem(ADMIN_EMAIL_KEY, opts.adminEmail);
  window.localStorage.setItem(CREATOR_KEY, opts.handle);
  window.localStorage.setItem(KIND_KEY, opts.kind ?? "creator");
  if (opts.targetName) window.localStorage.setItem(TARGET_NAME_KEY, opts.targetName);
  else window.localStorage.removeItem(TARGET_NAME_KEY);
}

function clearImpersonationContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RETURN_KEY);
  window.localStorage.removeItem(ADMIN_EMAIL_KEY);
  window.localStorage.removeItem(CREATOR_KEY);
  window.localStorage.removeItem(KIND_KEY);
  window.localStorage.removeItem(TARGET_NAME_KEY);
}

export function ImpersonationBanner() {
  const [state, setState] = useState<{
    returnUrl: string;
    adminEmail: string | null;
    handle: string | null;
    email: string | null;
    kind: "creator" | "agency" | "user";
    targetName: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const returnUrl = window.localStorage.getItem(RETURN_KEY);
    const adminEmail = window.localStorage.getItem(ADMIN_EMAIL_KEY);
    const handle = window.localStorage.getItem(CREATOR_KEY);
    const kind = (window.localStorage.getItem(KIND_KEY) as "creator" | "agency" | "user" | null) ?? "creator";
    const targetName = window.localStorage.getItem(TARGET_NAME_KEY);
    if (!returnUrl) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      // Only show if the current session is NOT the admin's own account
      if (email && email === adminEmail) {
        clearImpersonationContext();
        return;
      }
      setState({ returnUrl, adminEmail, handle, email, kind, targetName });
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

  const kindLabel = state.kind === "agency" ? "Agency owner" : state.kind === "user" ? "User" : "Creator";
  const targetLabel =
    state.kind === "agency"
      ? (state.targetName ?? "agency")
      : state.handle
        ? `@${state.handle}${state.targetName ? ` · ${state.targetName}` : ""}`
        : (state.targetName ?? "target");

  return (
    <div className="sticky top-14 z-40 border-b border-amber-400/40 bg-amber-500/95 text-black">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-semibold">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
            Admin impersonation
          </span>
          <span>
            <span className="opacity-70">{kindLabel}:</span> {targetLabel}
            {state.email ? <span className="opacity-70"> ({state.email})</span> : null}
          </span>
          {state.adminEmail && (
            <span className="opacity-70">
              signed in from admin <span className="font-mono">{state.adminEmail}</span>
            </span>
          )}
        </div>
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