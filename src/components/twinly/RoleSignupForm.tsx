import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";

const POST_AUTH_REDIRECT_KEY = "twinly:postAuthRedirect";
const CREATOR_PERSONA_SETUP_PATH = "/secure/personas";

function isCreatorRole(role: "fan" | "creator" | "agency") {
  return role === "creator" || role === "agency";
}

function postAuthPathForRole(role: "fan" | "creator" | "agency") {
  return isCreatorRole(role) ? CREATOR_PERSONA_SETUP_PATH : "/app";
}

function rememberPostAuthRedirect(path: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, path);
}

export function RoleSignupForm() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"fan" | "creator" | "agency">("fan");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const postAuthPath = postAuthPathForRole(role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    rememberPostAuthRedirect(postAuthPath);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth/callback" },
        });
        if (error) throw error;
        // upgrade role if not fan (trigger seeded 'fan')
        if (role !== "fan" && data.user) {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role });
        }
        toast.success(isCreatorRole(role) ? "Welcome — let's create your AI personas" : "Welcome to Twinly.life");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: postAuthPath });
    } catch (err: any) {
      toast.error(err.message ?? "Sign-in failed");
    } finally { setLoading(false); }
  }

  async function google() {
    rememberPostAuthRedirect(postAuthPath);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth/callback" });
    if (res.error) toast.error(res.error.message);
  }

  async function apple() {
    rememberPostAuthRedirect(postAuthPath);
    const res = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin + "/auth/callback" });
    if (res.error) toast.error(res.error.message);
  }

  // Microsoft OAuth (Azure AD) — only available when the project runs against
  // a self-hosted / BYO Supabase with the `azure` provider configured. Flag
  // it on with `VITE_ENABLE_MICROSOFT_OAUTH=1`.
  const microsoftEnabled = import.meta.env.VITE_ENABLE_MICROSOFT_OAUTH === "1"
    || import.meta.env.VITE_ENABLE_MICROSOFT_OAUTH === "true";

  async function microsoft() {
    try {
      rememberPostAuthRedirect(postAuthPath);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
          scopes: "email openid profile",
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Microsoft sign-in isn't available on this deployment.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg border border-border p-1">
        <button type="button" onClick={() => setMode("signup")}
          className={"rounded-md py-2 text-sm font-medium " + (mode === "signup" ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>
          Sign up
        </button>
        <button type="button" onClick={() => setMode("signin")}
          className={"rounded-md py-2 text-sm font-medium " + (mode === "signin" ? "bg-brand text-brand-foreground" : "text-muted-foreground")}>
          Sign in
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {mode === "signup" && (
          <div>
            <Label>I am a...</Label>
            <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="mt-2 grid grid-cols-3 gap-2">
              {(["fan","creator","agency"] as const).map(r => (
                <label key={r} className={"cursor-pointer rounded-lg border p-3 text-center text-xs font-semibold uppercase tracking-widest " + (role === r ? "border-brand bg-brand/10 text-brand-glow" : "border-border text-muted-foreground")}>
                  <RadioGroupItem value={r} className="sr-only" />
                  {r}
                </label>
              ))}
            </RadioGroup>
          </div>
        )}
        {isCreatorRole(role) && (
          <div className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">AI persona setup is integrated after secure login.</p>
            <p className="mt-1">
              Continue as a {role} and you will be routed to the protected persona setup hub for default personas, custom persona creation, training inputs, and content-pack setup.
            </p>
            <Link to={CREATOR_PERSONA_SETUP_PATH} className="mt-2 inline-block text-brand-glow underline underline-offset-4">
              Preview secure persona setup
            </Link>
          </div>
        )}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "..." : mode === "signup" ? isCreatorRole(role) ? "Create account & build personas" : "Create account" : "Sign in"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" onClick={google} className="w-full">
        Continue with Google
      </Button>
      <Button
        type="button"
        onClick={apple}
        className="w-full bg-black text-white hover:bg-black/90"
      >
        <svg viewBox="0 0 384 512" className="mr-2 h-4 w-4 fill-current" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM255.9 84.5c26.7-31.7 24.3-60.6 23.5-71-23.6 1.4-50.9 16.1-66.5 34.2-17.2 19.4-27.3 43.4-25.1 70.5 25.5 2 48.7-11.1 68.1-33.7z" />
        </svg>
        Continue with Apple
      </Button>
      {microsoftEnabled ? (
        <Button
          type="button"
          variant="outline"
          onClick={microsoft}
          className="w-full"
        >
          <svg viewBox="0 0 23 23" className="mr-2 h-4 w-4" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
          </svg>
          Continue with Microsoft
        </Button>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Microsoft sign-in</span> is available on self-hosted deployments.
          Set <code className="rounded bg-surface px-1 py-0.5 text-[10px]">VITE_ENABLE_MICROSOFT_OAUTH=1</code> and configure the Azure provider in your Supabase project to enable it.
        </div>
      )}
    </div>
  );
}
