import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Sparkles, Library, ShieldCheck, MessageCircle, Wallet, BadgeCheck, Package, User, Wand2, BarChart3, Moon, Flag, UserCheck, DollarSign, Eye, ClipboardList, ListChecks, UserCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { countOpenCreatorFlags } from "@/lib/conversation-flags.functions";
import { getBaselineVeniceStatus } from "@/lib/venice-character.functions";
import { SetupChecklist, type ChecklistStep } from "@/components/twinly/SetupChecklist";

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
  const [realMeCompletion, setRealMeCompletion] = useState<number | null>(null);
  const [baselineSlug, setBaselineSlug] = useState<string | null>(null);
  const [hasPricing, setHasPricing] = useState<boolean>(false);
  const [veniceSkipped, setVeniceSkipped] = useState<boolean>(false);
  const [veniceStatus, setVeniceStatus] = useState<{
    slug: string | null;
    status: "empty" | "verified" | "not_found" | "unavailable";
    characterName?: string;
    message?: string;
  } | null>(null);
  const countFlags = useServerFn(countOpenCreatorFlags);
  const loadVeniceStatus = useServerFn(getBaselineVeniceStatus);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("creators").select("id, handle, stage_name, verification_status, digital_twin_status, venice_character_slug").eq("user_id", user.id).maybeSingle();
      setCreator(c);
      if (c) {
        setBaselineSlug(((c as any).venice_character_slug as string | null) ?? null);
        const [{ count: personas }, { count: assets }, { count: pricing }] = await Promise.all([
          supabase.from("personas").select("id", { count: "exact", head: true }).eq("creator_id", c.id),
          supabase.from("content_assets").select("id", { count: "exact", head: true }).eq("creator_id", c.id),
          supabase.from("creator_tier_prices").select("id", { count: "exact", head: true }).eq("creator_id", c.id),
        ]);
        setCounts({ personas: personas ?? 0, assets: assets ?? 0 });
        setHasPricing((pricing ?? 0) > 0);
        countFlags({}).then((r) => setOpenFlags(r.count)).catch(() => {});
        loadVeniceStatus().then(setVeniceStatus).catch(() => {});

        // Read-only — never call getRealMeProfile here, it lazily creates
        // the row as a side effect just from viewing the dashboard.
        const { data: rm } = await supabase
          .from("real_me_profiles").select("current_version_id").eq("creator_id", c.id).maybeSingle();
        if (!rm) {
          setRealMeCompletion(0);
        } else if (!rm.current_version_id) {
          setRealMeCompletion(0);
        } else {
          const { data: v } = await supabase
            .from("real_me_profile_versions").select("completion_percentage").eq("id", rm.current_version_id).maybeSingle();
          setRealMeCompletion(v?.completion_percentage ?? 0);
        }
      }
    })();
  }, [user, countFlags]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!creator?.id) return;
    try { setVeniceSkipped(window.localStorage.getItem(`twinly:setup:skip-venice:${creator.id}`) === "1"); }
    catch { /* ignore */ }
  }, [creator?.id]);

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

  // ── Validation-driven per-step status ──────────────────────────────
  const twinStatus = creator.digital_twin_status as string;
  const twinDone = !!twinStatus && twinStatus !== "none";
  const twinReason: { text: string; tone: ChecklistStep["statusTone"] } | null =
    twinStatus === "approved" ? { text: "Baseline approved", tone: "ok" }
    : twinStatus === "pending_review" || twinStatus === "pending" ? { text: "Awaiting admin review", tone: "warn" }
    : twinStatus === "rejected" ? { text: "Rejected — please resubmit", tone: "error" }
    : twinStatus === "revoked" ? { text: "Consent revoked — restart setup", tone: "error" }
    : twinDone ? { text: `Status: ${twinStatus}`, tone: "info" }
    : null;

  const rmPct = realMeCompletion ?? 0;
  const rmDone = rmPct >= 100;
  const rmReason = rmDone
    ? { text: "Baseline complete", tone: "ok" as const }
    : rmPct > 0
      ? { text: `${rmPct}% complete — pick up where you left off`, tone: "info" as const }
      : null;

  const veniceDone =
    (veniceStatus?.status === "verified") ||
    (veniceStatus?.status === "empty" && veniceSkipped);
  const veniceReason: { text: string; tone: NonNullable<ChecklistStep["statusTone"]> } | null =
    veniceStatus?.status === "verified" && veniceStatus.characterName
      ? { text: `Verified — ${veniceStatus.characterName}`, tone: "ok" }
      : veniceStatus?.status === "not_found"
        ? { text: veniceStatus.message || "Saved ID no longer resolves on Venice.", tone: "error" }
        : veniceStatus?.status === "unavailable"
          ? { text: "Verification unavailable — Venice unreachable right now.", tone: "warn" }
          : veniceStatus?.status === "empty" && veniceSkipped
            ? { text: "Skipped — you can import one any time.", tone: "info" }
            : null;

  const verifyStatus = creator.verification_status as string;
  const verifyReason: { text: string; tone: NonNullable<ChecklistStep["statusTone"]> } | null =
    verifyStatus === "verified" ? { text: "Verified", tone: "ok" }
    : verifyStatus === "pending" ? { text: "Awaiting compliance review", tone: "warn" }
    : verifyStatus === "rejected" ? { text: "Rejected — resubmit documents", tone: "error" }
    : null;

  const setupSteps: ChecklistStep[] = [
    {
      key: "profile",
      title: "Create your creator profile",
      to: "/onboarding",
      done: true, // If we render this page, the creator row exists.
      statusReason: `Signed in as @${creator.handle}`,
      statusTone: "ok",
      why: "Your handle, stage name and creator record are the anchor everything else attaches to.",
      who: "Just you — this is the account behind the scenes; fans never see the raw record.",
      what: "Pick a handle and stage name so your studio has an identity.",
      how: "Already done — took a couple of minutes on signup.",
    },
    {
      key: "real-me",
      title: "Fill your Real Me baseline",
      to: "/studio/real-me",
      done: rmDone,
      statusReason: rmReason?.text,
      statusTone: rmReason?.tone,
      why: "Your tone, voice and baseline answers — every AI persona auto-generates its style from this.",
      who: "You. Nothing here goes to fans directly; it seeds the AI personas you'll create.",
      what: "Answer a short questionnaire about how you talk, what you like, what's off-limits.",
      how: "10–15 minutes; you can save and come back any time.",
    },
    {
      key: "twin",
      title: "Set up your AI Twin baseline",
      to: "/studio/twin-onboarding",
      toSearch: twinDone ? undefined : { step: 1 },
      done: twinDone,
      statusReason: twinReason?.text,
      statusTone: twinReason?.tone,
      why: "Reference photos + consent form the shared baseline every persona draws from. No baseline, no generation.",
      who: "You upload; a Twinly admin reviews before anything can be generated.",
      what: "1–8 non-explicit angles (front, 3/4, profile) and granular consent toggles.",
      how: "~5 minutes to upload; review usually same-day.",
    },
    {
      key: "venice",
      title: "Import a Venice Character ID",
      to: "/studio/twin-onboarding",
      toSearch: { step: 2 },
      optional: true,
      done: !!veniceDone,
      statusReason: veniceReason?.text,
      statusTone: veniceReason?.tone,
      why: "Optional. If you already have a Venice Character, pinning it here makes every new persona use it as the default.",
      who: "Only relevant if you've published a Character on venice.ai already.",
      what: "Paste the ID (last segment of venice.ai/c/<id>) and confirm the live preview.",
      how: "~30 seconds — or skip it and set per-persona later.",
    },
    {
      key: "persona",
      title: "Create your first AI persona",
      to: "/studio/personas/new",
      done: counts.personas > 0,
      statusReason: counts.personas > 0 ? `${counts.personas} persona${counts.personas === 1 ? "" : "s"} created` : undefined,
      statusTone: counts.personas > 0 ? "ok" : undefined,
      why: "Personas are the actual characters fans chat with — Nice, Naughty, Wicked or fully custom.",
      who: "You configure; fans interact with the finished persona.",
      what: "Name, disclosure label, tone, boundaries, price tier, optional external model IDs.",
      how: "5–10 minutes; the form pre-fills from your Real Me and Twin baselines.",
    },
    {
      key: "content",
      title: "Upload content to your vault",
      to: "/studio/content",
      done: counts.assets > 0,
      statusReason: counts.assets > 0 ? `${counts.assets} vault asset${counts.assets === 1 ? "" : "s"}` : undefined,
      statusTone: counts.assets > 0 ? "ok" : undefined,
      why: "The vault is where images, clips and voice notes live before you attach them to packs or posts.",
      who: "You upload; the moderation pipeline scans before assets go live.",
      what: "Drop in the media you want personas to be able to share.",
      how: "As long or short as you like — start with a handful and grow it.",
    },
    {
      key: "pricing",
      title: "Set your subscription pricing",
      to: "/studio/pricing",
      done: hasPricing,
      statusReason: hasPricing ? "Tier prices set" : undefined,
      statusTone: hasPricing ? "ok" : undefined,
      why: "Monthly Base / Plus / VIP tiers gate premium chats, packs and posts.",
      who: "You decide; fans pay in your chosen currency at checkout.",
      what: "Three monthly prices, or free-for-all if you leave a tier unset.",
      how: "~2 minutes; you can change prices later without kicking existing subscribers.",
    },
    {
      key: "verify",
      title: "Get verified (ID + likeness)",
      to: "/studio/twin",
      done: creator.verification_status === "verified",
      statusReason: verifyReason?.text,
      statusTone: verifyReason?.tone,
      why: "Verification unlocks payouts, higher trust badges and adult-content generation.",
      who: "Twinly's compliance reviewers, one-time.",
      what: "Photo ID + a matching selfie against your Twin baseline.",
      how: "5 minutes to submit; usually reviewed within a business day.",
    },
  ];

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

      <SetupChecklist steps={setupSteps} />

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
        <Tile to="/studio/real-me" icon={<UserCircle className="size-5 text-brand-glow" />} title="Real Me baseline" desc="The foundational questionnaire every persona is built from." />
        <Tile to="/studio/personas" icon={<Sparkles className="size-5 text-brand-glow" />} title="Persona studio" desc="Create, edit, publish, reorder personas." />
        <Tile to="/studio/persona-onboarding" icon={<ClipboardList className="size-5 text-brand-glow" />} title="Persona onboarding" desc="Brand-safe questionnaire, generated tone guidelines & openers, preview, export." />
        <Tile to="/studio/content" icon={<Library className="size-5 text-brand-glow" />} title="Content vault" desc="Upload assets and attach per persona." />
        <Tile to="/studio/packs" icon={<Package className="size-5 text-brand-glow" />} title="Content packs" desc="Bundle assets into Nice, Naughty, Wicked, Seasonal & custom packs." />
        <Tile to="/studio/create" icon={<Wand2 className="size-5 text-brand-glow" />} title="Twinly Create" desc="Plan AI image, voice & video jobs — approval-gated placeholder workflow." />
        <Tile to="/studio/generate" icon={<Sparkles className="size-5 text-brand-glow" />} title="AI generate (preview)" desc="Prototype live generation — images, voice notes & talking-head clips." />
        <Tile to="/studio/inbox" icon={<MessageCircle className="size-5 text-brand-glow" />} title="Real Me inbox" desc="Reply to fans on your Real Me persona." />
        <Tile to="/studio/ai-review" icon={<Flag className="size-5 text-brand-glow" />} title="AI persona review" desc="Review AI chats, flag bad replies, save corrections as training." />
        <Tile to="/studio/flags" icon={<Flag className="size-5 text-brand-glow" />} title="Flagged AI chats" desc="Your control centre for AI chats needing review — supporter reports and auto-detected issues, together." badge={openFlags} />
        <Tile to="/studio/escalations" icon={<UserCheck className="size-5 text-brand-glow" />} title="Real Me requests" desc="Accept or decline supporters asking to talk to you directly." />
        <Tile to="/studio/payouts" icon={<Wallet className="size-5 text-brand-glow" />} title="Payouts" desc="Payment history, subscribers, next payout." />
        <Tile to="/studio/pricing" icon={<DollarSign className="size-5 text-brand-glow" />} title="Subscription pricing" desc="Set your monthly Base / Plus / VIP tier prices." />
        <Tile to="/studio/feed-visibility" icon={<Eye className="size-5 text-brand-glow" />} title="Feed visibility" desc="Set default audience per persona, curate individual posts, and preview by tier." />
        <Tile to="/studio/polls" icon={<ListChecks className="size-5 text-brand-glow" />} title="Polls" desc="Single/multi-choice and tip-to-vote polls, feed-attached or standalone." />
        <Tile to="/studio/analytics" icon={<BarChart3 className="size-5 text-brand-glow" />} title="Analytics" desc="Generation volume, approval rate, chat engagement." />
        <Tile to="/studio/twin" icon={<User className="size-5 text-brand-glow" />} title="Digital twin profile" desc="Identity, voice, style, consent & use rules." />
        <Tile to="/studio/away" icon={<Moon className="size-5 text-brand-glow" />} title="Away mode" desc="Auto-reply for Real Me and route fans to your AI personas when you're offline." />
        <Tile to="/secure/personas" icon={<ShieldCheck className="size-5 text-brand-glow" />} title="Secure persona setup hub" desc="Default personas, custom persona creation, training inputs and content-pack setup — the guided post-signup flow, available any time." />
      </div>
    </AppShell>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const tone =
    value === "verified" || value === "active" || value === "approved" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
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