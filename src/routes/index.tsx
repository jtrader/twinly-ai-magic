import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AgeGateDialog } from "@/components/twinly/AgeGateDialog";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { ShieldCheck, Sparkles, Bot, User2, Lock } from "lucide-react";
import { ArrowRight, Heart } from "lucide-react";
import heroReal from "@/assets/hero-real.png.asset.json";
import heroAi from "@/assets/hero-ai.png.asset.json";
import brandIcon from "@/assets/brand-icon.png.asset.json";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => {
    const site = "https://twinly-ai-magic.lovable.app";
    const title = "Twinly.life — Verified creators. Official AI twins & personas.";
    const description =
      "The creator-owned digital twin platform. Chat with the real creator or their official AI personas — every AI clearly disclosed, every experience creator-controlled. 18+.";
    const image = `${site}${heroAi.url}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: `${site}/` },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1024" },
        { property: "og:image:height", content: "1024" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: `${site}/` }],
    };
  },
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AgeGateDialog />
      <TopNav />
      <Hero />
      <TrustStrip />
      <PersonaGrid />
      <JoinBanner />
      <ForCreators />
      <FinalCta />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <img
            src={brandIcon.url}
            alt="Twinly.life logo"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <span>Twinly<span className="text-brand-glow">.life</span></span>
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
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-16 md:grid-cols-[1fr_1.05fr] md:items-center md:pt-24">
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-widest uppercase text-brand-glow">
            <Sparkles className="size-3.5" /> Verified creator platform
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Real when it matters.<br />
            <span className="text-brand-glow">AI when you want the fantasy.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:mx-0 md:text-lg">
            Twinly.life lets verified creators launch official AI twins and unlimited personas — every AI clearly disclosed, every experience creator-controlled.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row md:justify-start">
            <Link to="/discover"><Button size="lg" className="w-full sm:w-auto">Explore creators</Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline" className="w-full sm:w-auto">Apply as creator</Button></Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">18+ only · Adult platform · Consent-first design</p>
        </div>
        <HeroCompare />
      </div>
    </section>
  );
}

function HeroCompare() {
  const items = [
    {
      src: heroReal.url,
      badge: "Real Me",
      badgeClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
      caption: "Verified creator · human-shot",
    },
      {
        src: heroAi.url,
      badge: "AI persona",
      badgeClass: "border-brand/40 bg-brand/15 text-brand-glow",
      caption: "AI-rendered fantasy · always disclosed",
    },
  ];
  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {items.map((it) => (
          <figure
            key={it.badge}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-20px_rgba(120,60,255,0.35)]"
          >
            <div className="aspect-[4/5] w-full overflow-hidden">
              <img
                src={it.src}
                alt={`${it.badge} — ${it.caption}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                loading="eager"
                width={1024}
                height={1280}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent" />
            <figcaption className="absolute inset-x-0 bottom-0 p-3">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${it.badgeClass}`}>
                {it.badge === "AI persona" ? <Bot className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {it.badge}
              </span>
              <div className="mt-1 text-[11px] text-muted-foreground">{it.caption}</div>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/40 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-brand-glow backdrop-blur sm:block">
        Real → AI
      </div>
    </div>
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
      <div>© {new Date().getFullYear()} Twinly.life · 18+ · <Link to="/legal/terms" className="underline">Terms</Link> · <Link to="/legal/privacy" className="underline">Privacy</Link> · <Link to="/legal/ai-disclosure" className="underline">AI disclosure</Link></div>
    </footer>
  );
}
