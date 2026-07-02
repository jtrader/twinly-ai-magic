import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";

export function RoleSignupForm() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"fan" | "creator" | "agency">("fan");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        // upgrade role if not fan (trigger seeded 'fan')
        if (role !== "fan" && data.user) {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role });
        }
        toast.success("Welcome to Twinly.life");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err.message ?? "Sign-in failed");
    } finally { setLoading(false); }
  }

  async function google() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/app" });
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
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "..." : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" onClick={google} className="w-full">
        Continue with Google
      </Button>
    </div>
  );
}