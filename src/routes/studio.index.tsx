import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Sparkles, Library, ShieldCheck, MessageCircle, Wallet, BadgeCheck, Package, User, Wand2, BarChart3, Moon, Flag, UserCheck, DollarSign } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { countOpenCreatorFlags } from "@/lib/conversation-flags.functions";

export const Route = createFileRoute("/studio/")({
  component: StudioHome,
  head: () => ({
    meta: [
      { title: "Creator studio — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function StudioHome() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<any>(null);
  const [counts, setCounts] = useState({ personas: 0, assets: 0 });
  const [openFlags, setOpenFlags] = useState(0);
  const countFlags = useServerFn(countOpenCreatorFlags);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("creators").select("id, handle, stage_name, verification_status, digital_twin_status").eq("user_id", user.id).maybeSingle();
      setCreator(c);
      if (c) {
        const [{ count: personas }, { count: assets }] = await Promise.all([
          supabase.from("personas").select("id", { count: "exact", head: true }).eq("creator_id", c.id),
          supabase.from("content_assets").select("id", { count: "exact", head: true }).eq("creator_id", c.id),
        ]);
        setCounts({ personas: personas ?? 0, assets: assets ?? 0 });
        countFlags({}).then((r) => setOpenFlags(r.count)).catch(() => {});
      }
    })();
  }, [user, countFlags]);

  if (!creator) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
          <h1 className="font-display text-xl font-bold">Creator studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">Complete onboarding to unlock your creator studio.</p>
          <Link to="/onboarding" className="mt-4 inline-block"><Button>Start onboarding</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="mt-1 font-display text-3xl font-bold">{creator.stage_name}</h1>
          <div className="mt-1 text-sm text-muted-foreground">@{creator.handle}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusBadge label="Verification" value={creator.verification_status} />
          <StatusBadge label="Digital twin" value={creator.digital_twin_status} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Personas" value={counts.personas} />
        <Stat label="Vault assets" value={counts.assets} />
        <Stat label="Subscribers" value="—" hint="Coming soon" />
        <Stat label="Revenue (MTD)" value="—" hint="Coming soon" />
      </div>

      <div className="mb-6">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Analytics (placeholders)</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Profile views (7d)" value="—" />
          <Stat label="Chats started (7d)" value="—" />
          <Stat label="Avg session (min)" value="—" />
          <Stat label="Vault views (7d)" value="—" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Tile to="/creators/$handle" params={{ handle: creator.handle }} icon={<BadgeCheck className="size-5 text-brand-glow" />} title="Public profile" desc="See what fans see." />
        <Tile to="/studio/personas" icon={<Sparkles className="size-5 text-brand-glow" />} title="Persona studio" desc="Create, edit, publish, reorder personas." />
        <Tile to="/studio/content" icon={<Library className="size-5 text-brand-glow" />} title="Content vault" desc="Upload assets and attach per persona." />
        <Tile to="/studio/packs" icon={<Package className="size-5 text-brand-glow" />} title="Content packs" desc="Bundle assets into Nice, Naughty, Wicked, Seasonal & custom packs." />
        <Tile to="/studio/create" icon={<Wand2 className="size-5 text-brand-glow" />} title="Twinly Create" desc="Plan AI image, voice & video jobs — approval-gated placeholder workflow." />
        <Tile to="/studio/generate" icon={<Sparkles className="size-5 text-brand-glow" />} title="AI generate (preview)" desc="Prototype live generation — images, voice notes & talking-head clips." />
        <Tile to="/studio/inbox" icon={<MessageCircle className="size-5 text-brand-glow" />} title="Real Me inbox" desc="Reply to fans on your Real Me persona." />
        <Tile to="/studio/ai-review" icon={<Flag className="size-5 text-brand-glow" />} title="AI persona review" desc="Review AI chats, flag bad replies, save corrections as training." />
        <Tile to="/studio/flags" icon={<Flag className="size-5 text-brand-glow" />} title="Flagged AI chats" desc="Supporter-flagged AI conversations for your review or handoff to Real Me." badge={openFlags} />
        <Tile to="/studio/escalations" icon={<UserCheck className="size-5 text-brand-glow" />} title="Real Me requests" desc="Accept or decline supporters asking to talk to you directly." />
        <Tile to="/studio/payouts" icon={<Wallet className="size-5 text-brand-glow" />} title="Payouts" desc="Payment history, subscribers, next payout." />
        <Tile to="/studio/pricing" icon={<DollarSign className="size-5 text-brand-glow" />} title="Subscription pricing" desc="Set your monthly Base / Plus / VIP tier prices." />
        <Tile to="/studio/analytics" icon={<BarChart3 className="size-5 text-brand-glow" />} title="Analytics" desc="Generation volume, approval rate, chat engagement." />
        <Tile to="/studio/twin" icon={<User className="size-5 text-brand-glow" />} title="Digital twin profile" desc="Identity, voice, style, consent & use rules." />
        <Tile to="/studio/away" icon={<Moon className="size-5 text-brand-glow" />} title="Away mode" desc="Auto-reply for Real Me and route fans to your AI personas when you're offline." />
        <Tile icon={<ShieldCheck className="size-5 text-brand-glow" />} title="Consent & verification" desc="Digital twin consent, ID checks." disabled />
      </div>
    </AppShell>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const tone =
    value === "verified" || value === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : value === "pending" ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
    : value === "rejected" || value === "revoked" ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
    : "border-border bg-surface text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold uppercase tracking-widest ${tone}`}>
      {label}: {value}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Tile({ to, params, icon, title, desc, disabled, badge }: any) {
  const body = (
    <div className={"h-full rounded-2xl border border-border bg-surface p-5 transition " + (disabled ? "opacity-60" : "hover:border-brand/40 hover:bg-surface-elevated")}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="font-display text-lg font-semibold">{title}</div>
        {typeof badge === "number" && badge > 0 && (
          <span className="ml-auto rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
            {badge} open
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 text-xs font-semibold text-brand-glow">{disabled ? "Coming soon" : "Open →"}</div>
    </div>
  );
  if (disabled || !to) return <div>{body}</div>;
  return <Link to={to} params={params}>{body}</Link>;
}