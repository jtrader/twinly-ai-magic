import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AgeGateDialog } from "@/components/twinly/AgeGateDialog";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { ShieldCheck, Sparkles, Bot, User2, Lock } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AgeGateDialog />
      <TopNav />
      <Hero />
      <TrustStrip />
      <PersonaGrid />
      <ForCreators />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="font-display text-lg font-bold tracking-tight">
          Twinly<span className="text-brand-glow">.ai</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/discover" className="hidden text-sm text-muted-foreground hover:text-foreground md:block">Discover</Link>
          <Link to="/auth"><Button size="sm" variant="ghost">Sign in</Button></Link>
          <Link to="/auth"><Button size="sm">Get started</Button></Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(60%_60%_at_50%_0%,theme(colors.brand)/20,transparent)]" />
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 text-center md:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-widest uppercase text-brand-glow">
          <Sparkles className="size-3.5" /> Verified creator platform
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          Real when it matters.<br />
          <span className="text-brand-glow">AI when you want the fantasy.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
          Twinly.ai lets verified creators launch official AI twins and unlimited personas — every AI clearly disclosed, every experience creator-controlled.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/discover"><Button size="lg" className="w-full sm:w-auto">Explore creators</Button></Link>
          <Link to="/auth"><Button size="lg" variant="outline" className="w-full sm:w-auto">Apply as creator</Button></Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">18+ only · Adult platform · Consent-first design</p>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { icon: ShieldCheck, label: "Verified creators only" },
    { icon: Bot, label: "Every AI persona disclosed" },
    { icon: Lock, label: "Consent-based digital twins" },
    { icon: User2, label: "Real Me kept separate" },
  ];
  return (
    <section className="border-y border-border/60 bg-surface/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-6 md:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
            <Icon className="size-4 text-brand-glow" /> {label}
          </div>
        ))}
      </div>
    </section>
  );
}

function PersonaGrid() {
  const items = [
    { name: "Real Me", kind: "real_me" as const, blurb: "Direct with the verified creator. No AI in the loop." },
    { name: "Nice AI", kind: "ai" as const, blurb: "Warm, playful, safe-for-work AI persona." },
    { name: "Naughty AI", kind: "ai" as const, blurb: "Flirty AI persona with clear boundaries." },
    { name: "Wicked AI", kind: "ai" as const, blurb: "Adults-only AI persona for VIPs." },
    { name: "Custom", kind: "ai" as const, blurb: "Creators can spin up unlimited themed personas — VIP Fantasy, After Dark, XNurse and more." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Persona system</div>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">One creator. Many disclosed personas.</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <div key={p.name} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between">
              <div className="font-display text-lg font-semibold">{p.name}</div>
              <PersonaBadge kind={p.kind} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{p.blurb}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Default names are examples only. Creators define the persona catalog — names, tone, rules, pricing, visibility, and lifecycle.</p>
    </section>
  );
}

function ForCreators() {
  return (
    <section className="border-t border-border/60 bg-surface/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-glow">For creators</div>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">Own your twin. Own your revenue.</h2>
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li>• Verified onboarding with agency support</li>
            <li>• Consent-first digital twin — text now, voice + video later</li>
            <li>• Unlimited AI personas with per-persona pricing and vault</li>
            <li>• Transparent AI disclosure on every message</li>
          </ul>
          <Link to="/auth" className="mt-6 inline-block"><Button size="lg">Apply as a creator</Button></Link>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Coming soon</div>
          <ul className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {["Voice twin", "Image gen", "Video gen", "Avatar chat", "Agency multi-manage", "Payouts"].map((x) => (
              <li key={x} className="rounded-lg border border-border bg-surface-elevated px-3 py-2">{x}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
      <div>© {new Date().getFullYear()} Twinly.ai · 18+ · <Link to="/legal/terms" className="underline">Terms</Link> · <Link to="/legal/privacy" className="underline">Privacy</Link> · <Link to="/legal/ai-disclosure" className="underline">AI disclosure</Link></div>
    </footer>
  );
}
