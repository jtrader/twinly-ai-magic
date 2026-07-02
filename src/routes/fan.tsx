import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Sparkles, MessageCircle, ShieldCheck, Compass } from "lucide-react";

export const Route = createFileRoute("/fan")({
  component: FanDashboard,
  head: () => ({
    meta: [
      { title: "Your dashboard — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function FanDashboard() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<any[]>([]);
  const [convos, setConvos] = useState<any[]>([]);
  const [profile, setProfile] = useState<{ age_verified_at: string | null } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
        supabase.from("subscriptions")
          .select("id, status, tier, current_period_end, creator_id, creators:creator_id(handle, stage_name)")
          .eq("fan_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("conversations")
          .select("id, last_message_at, persona_id, creator_id, personas:persona_id(display_name, kind, slug), creators:creator_id(handle, stage_name)")
          .eq("fan_id", user.id).order("last_message_at", { ascending: false }).limit(10),
        supabase.from("profiles").select("age_verified_at").eq("id", user.id).maybeSingle(),
      ]);
      setSubs(s ?? []);
      setConvos(c ?? []);
      setProfile(p ?? null);
      setReady(true);
    })();
  }, [user]);

  if (loading || !ready) {
    return <AppShell><div className="py-20 text-center text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fan dashboard</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Your Twinly</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active subscriptions" value={subs.filter((s) => s.status === "active").length} />
        <Stat label="Recent chats" value={convos.length} />
        <Stat label="Age verified" value={profile?.age_verified_at ? "Yes" : "No"} tone={profile?.age_verified_at ? "ok" : "warn"} />
        <Stat label="Followed creators" value={subs.length} />
      </div>

      <section className="mb-6">
        <SectionHead icon={<Sparkles className="size-4 text-brand-glow" />} title="Your subscriptions" />
        {subs.length === 0 ? (
          <EmptyRow text="No subscriptions yet." cta={{ to: "/discover", label: "Discover creators" }} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subs.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold">{s.creators?.stage_name ?? "Creator"}</div>
                    <div className="truncate text-xs text-muted-foreground">@{s.creators?.handle}</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{s.tier ?? "sub"} · {s.status}</Badge>
                </div>
                {s.creators?.handle && (
                  <div className="mt-3">
                    <Link to="/creators/$handle" params={{ handle: s.creators.handle }}>
                      <Button size="sm" variant="outline">Open profile</Button>
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <SectionHead icon={<MessageCircle className="size-4 text-brand-glow" />} title="Recent chats" />
        {convos.length === 0 ? (
          <EmptyRow text="You haven't started any chats." cta={{ to: "/discover", label: "Find a persona" }} />
        ) : (
          <div className="space-y-2">
            {convos.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {c.personas?.display_name} <span className="ml-1 text-xs text-muted-foreground">· @{c.creators?.handle}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.personas?.kind === "ai" ? "AI persona" : "Real Me"} · {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
                  </div>
                </div>
                {c.creators?.handle && c.personas && (
                  <Link to="/chat/$handle/$persona" params={{ handle: c.creators.handle, persona: (c.personas as any).slug ?? c.persona_id }}>
                    <Button size="sm" variant="ghost">Open</Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead icon={<ShieldCheck className="size-4 text-brand-glow" />} title="Account" />
        <div className="grid gap-3 md:grid-cols-2">
          <Link to="/account"><Tile title="Account & age" desc="Manage profile, email, and 18+ status." /></Link>
          <Link to="/discover"><Tile title="Discover" desc="Browse verified creators and personas." icon={<Compass className="size-4 text-brand-glow" />} /></Link>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={"mt-1 font-display text-2xl font-bold " + cls}>{value}</div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <h2 className="font-display text-lg font-semibold">{title}</h2>
    </div>
  );
}

function EmptyRow({ text, cta }: { text: string; cta: { to: string; label: string } }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-dashed border-border bg-surface p-6">
      <div className="text-sm text-muted-foreground">{text}</div>
      <Link to={cta.to as any}><Button size="sm" variant="outline">{cta.label}</Button></Link>
    </div>
  );
}

function Tile({ title, desc, icon }: { title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 hover:border-brand/40 hover:bg-surface-elevated">
      <div className="flex items-center gap-2">{icon}<div className="font-display text-lg font-semibold">{title}</div></div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
