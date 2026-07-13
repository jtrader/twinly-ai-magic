import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { acceptLegal, LEGAL_ACCEPTANCE_VERSION } from "@/lib/legal-acceptance.functions";
import { useServerFn } from "@tanstack/react-start";

const POST_AUTH_REDIRECT_KEY = "twinly:postAuthRedirect";
const CREATOR_PERSONA_SETUP_PATH = "/secure/personas";

type SignupRole = "fan" | "creator" | "agency";

function isCreatorRole(role: SignupRole) {
  return role === "creator" || role === "agency";
}

function postAuthPathForRole(role: SignupRole) {
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
  const [role, setRole] = useState<SignupRole>("fan");
  const [loading, setLoading] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const navigate = useNavigate();
  const postAuthPath = postAuthPathForRole(role);
  const recordLegal = useServerFn(acceptLegal);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !acceptedLegal) {
      toast.error("Please accept the Terms, Privacy Policy, and Acceptable Use policy to continue.");
      return;
    }
    setLoading(true);
    rememberPostAuthRedirect(postAuthPath);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
            data: {
              legal_accepted_at: new Date().toISOString(),
              legal_accepted_version: "2026-07-13",
            },
          },
        });
        if (error) throw error;
        // upgrade role if not fan (trigger seeded 'fan')
        if (role !== "fan" && data.user) {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role });
        }
        // Server-authoritative legal acceptance record (audit-logged). If the
        // audit write fails we surface the error and stop — do not silently
        // continue into the app without a recorded acceptance.
        try {
          await recordLegal({ data: { version: LEGAL_ACCEPTANCE_VERSION, context: "signup_form" } });
        } catch (e: any) {
          toast.error(e?.message ?? "We couldn't record your legal acceptance. Please try again.");
          return;
        }
        toast.success(isCreatorRole(role) ? "Welcome — let's create your AI personas" : "Welcome to Twinly.life");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: postAuthPath as any });
    } catch (err: any) {
      toast.error(err.message ?? "Sign-in failed");
    } finally { setLoading(false); }
  }

  async function google() {
    if (mode === "signup" && !acceptedLegal) {
      toast.error("Please accept the Terms, Privacy Policy, and Acceptable Use policy to continue.");
      return;
    }
    rememberPostAuthRedirect(postAuthPath);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth/callback" });
    if (res.error) toast.error(res.error.message);
  }

  async function apple() {
    if (mode === "signup" && !acceptedLegal) {
      toast.error("Please accept the Terms, Privacy Policy, and Acceptable Use policy to continue.");
      return;
    }
    rememberPostAuthRedirect(postAuthPath);
    const res = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin + "/auth/callback" });
    if (res.error) toast.error(res.error.message);
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
            <RadioGroup value={role} onValueChange={(v) => setRole(v as SignupRole)} className="mt-2 grid grid-cols-3 gap-2">
              {(["fan","creator","agency"] as const).map(r => {
                const label = r === "fan" ? "Supporter" : r;
                return (
                  <label key={r} className={"cursor-pointer rounded-lg border p-3 text-center text-xs font-semibold uppercase tracking-widest has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring " + (role === r ? "border-brand bg-brand/10 text-brand-glow" : "border-border text-muted-foreground")}>
                    <RadioGroupItem value={r} className="sr-only" />
                    {label}
                  </label>
                );
              })}
            </RadioGroup>
          </div>
        )}
        {isCreatorRole(role) && (
          <div className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">AI persona setup is integrated after secure login.</p>
            <p className="mt-1">
              Continue as a {role} and you will be routed to the protected persona setup hub for default personas, custom persona creation, training inputs, and content-pack setup.
            </p>
            <Link to="/secure/personas" className="mt-2 inline-block text-brand-glow underline underline-offset-4">
              Preview secure persona setup
            </Link>
          </div>
        )}
        {mode === "signup" && (
          <label className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
            <Checkbox
              checked={acceptedLegal}
              onCheckedChange={(v) => setAcceptedLegal(v === true)}
              className="mt-0.5"
              aria-label="Accept legal policies"
            />
            <span>
              I am 18+ and I agree to the{" "}
              <Link to="/legal/terms" target="_blank" className="underline">Terms</Link>,{" "}
              <Link to="/legal/privacy" target="_blank" className="underline">Privacy Policy</Link>,{" "}
              <Link to="/legal/acceptable-use" target="_blank" className="underline">Acceptable Use</Link>, and{" "}
              <Link to="/legal/ai-disclosure" target="_blank" className="underline">AI Disclosure</Link>.
            </span>
          </label>
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
    </div>
  );
}
