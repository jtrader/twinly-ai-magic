import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AgeGateDialog } from "@/components/twinly/AgeGateDialog";
import { PersonaBadge } from "@/components/twinly/PersonaBadge";
import { TwinlyWordmark } from "@/components/twinly/TwinlyWordmark";
import { ShieldCheck, Sparkles, Bot, User2, Lock } from "lucide-react";
import { ArrowRight, Heart } from "lucide-react";
import heroAi from "@/assets/hero-ai.png.asset.json";
import brandIcon from "@/assets/brand-icon.png.asset.json";
import personaRealMe from "@/assets/persona-real-me.png.asset.json";
import personaNiceAi from "@/assets/persona-nice-ai.png.asset.json";
import personaNaughtyAi from "@/assets/persona-naughty-ai.png.asset.json";
import personaWickedAi from "@/assets/persona-wicked-ai.png.asset.json";
import personaCustom from "@/assets/persona-custom.png.asset.json";

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
          <TwinlyWordmark />
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
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{ background: "var(--gradient-brand-radial)" }}
        aria-hidden="true"
      />
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
      src: heroAi.url,
      badge: "AI persona",
      badgeClass: "border-brand/40 bg-brand/15 text-brand-glow",
      caption: "AI-rendered fantasy · always disclosed",
    },
  ];
  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {items.map((it) => (
          <figure
            key={it.badge}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface"
            style={{ boxShadow: "var(--shadow-brand-glow-strong)" }}
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
    {
      name: "Real Me",
      kind: "real_me" as const,
      tagline: "The verified creator, unfiltered.",
      blurb: "Every message is typed by the real, verified person. No AI ghostwriting, no auto-replies — just direct conversation with the creator themselves.",
      image: personaRealMe.url,
      alt: "Real Me persona portrait — natural daylight, no filter",
    },
    {
      name: "Nice AI",
      kind: "ai" as const,
      tagline: "Warm, playful, safe-for-work.",
      blurb: "A friendly AI companion for daily chats, hype and encouragement. Clearly disclosed as AI, tuned for comfort and always inside safe-for-work limits.",
      image: personaNiceAi.url,
      alt: "Nice AI persona portrait — pastel aura, warm smile",
    },
    {
      name: "Naughty AI",
      kind: "ai" as const,
      tagline: "Flirty, with clear boundaries.",
      blurb: "A playful, flirty AI persona for suggestive chat. Consent-first and rule-bound — the creator sets exactly what it will and won't say.",
      image: personaNaughtyAi.url,
      alt: "Naughty AI persona portrait — magenta neon, flirty smirk",
    },
    {
      name: "Wicked AI",
      kind: "ai" as const,
      tagline: "Adults-only, VIP-gated.",
      blurb: "The 18+ tier for verified VIP fans. Age-gated, paywalled and creator-controlled, with per-persona rules and full moderation trail.",
      image: personaWickedAi.url,
      alt: "Wicked AI persona portrait — crimson and violet noir lighting",
    },
    {
      name: "Custom",
      kind: "ai" as const,
      tagline: "Unlimited themed personas.",
      blurb: "Spin up any character — VIP Fantasy, After Dark, XNurse, cosplay drops. Each persona gets its own tone, pricing, vault and visibility.",
      image: personaCustom.url,
      alt: "Custom persona portrait — kaleidoscopic prism lighting",
    },
  ];
  const [selected, setSelected] = useState<string>(items[0].name);
  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Persona system</div>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">One creator. Many disclosed personas.</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Tap a persona to see how it shows up to fans.</p>
        </div>
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((p) => {
          const isSelected = selected === p.name;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => setSelected(p.name)}
              aria-pressed={isSelected}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-glow ${
                isSelected
                  ? "-translate-y-0.5 border-brand-glow shadow-[0_0_0_1px_rgb(var(--brand-glow-rgb,168_85_247)/0.6),0_20px_40px_-20px_rgb(168_85_247/0.4)]"
                  : "border-border hover:-translate-y-0.5 hover:border-brand-glow/60 hover:shadow-lg"
              }`}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-black/40">
                <img
                  src={p.image}
                  alt={p.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent transition-opacity duration-300 ${
                    isSelected ? "opacity-100" : "opacity-70 group-hover:opacity-90"
                  }`}
                />
                <div className="absolute left-2 top-2">
                  <PersonaBadge kind={p.kind} />
                </div>
                {isSelected && (
                  <div className="absolute right-2 top-2 rounded-full bg-brand-glow px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">
                    Selected
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="font-display text-sm font-semibold text-white drop-shadow">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/80">{p.tagline}</div>
                </div>
              </div>
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                  isSelected ? "grid-rows-[1fr]" : "grid-rows-[0fr] group-hover:grid-rows-[1fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-3 pb-3 pt-3 text-xs leading-relaxed text-muted-foreground">{p.blurb}</p>
                </div>
              </div>
            </button>
          );
        })}
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

function JoinBanner() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 pt-2 md:pb-16">
      <div
        className="relative overflow-hidden rounded-3xl border border-brand/40 p-6 md:p-10"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--brand-tint-medium) 0%, var(--surface) 55%, var(--background) 100%)",
        }}
      >
        {/* Animated aurora backdrop — brav-0.com inspired, palette locked
            to Twinly brand tokens (brand / brand-glow / ai). */}
        <div className="pointer-events-none absolute inset-0 opacity-90" aria-hidden="true">
          <div className="aurora-blob -right-24 -top-24 h-80 w-80 bg-brand" />
          <div className="aurora-blob-alt -bottom-28 -left-16 h-72 w-72 bg-brand-glow" />
          <div className="aurora-blob left-1/3 top-1/2 h-64 w-64 -translate-y-1/2 bg-ai" style={{ animationDuration: "26s" }} />
          <div
            className="absolute inset-0 mix-blend-overlay opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, var(--glow-tint-medium), transparent 45%), radial-gradient(circle at 80% 70%, var(--brand-tint-strong), transparent 50%)",
            }}
          />
        </div>
        <div className="relative flex flex-col items-stretch gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-background/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-brand-glow backdrop-blur">
              <Sparkles className="h-3 w-3" /> Free to join · 18+
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight md:text-4xl">
              Meet your favourite creators — and their AI twins.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Sign up in seconds. Follow verified creators, chat with their Real Me, and unlock disclosed AI personas.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:flex-col md:items-end">
            <Link to="/auth">
              <Button size="lg" className="w-full sm:w-auto md:w-full">
                Join <TwinlyWordmark /> <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/discover">
              <Button size="lg" variant="outline" className="w-full sm:w-auto md:w-full">
                Browse creators
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="rounded-3xl border border-border bg-surface p-8 text-center md:p-14">
        <Heart className="mx-auto h-8 w-8 text-brand-glow" aria-hidden="true" />
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-5xl">
          Ready when you are.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground md:text-base">
          Whether you want to <span className="text-foreground">discover creators</span> or <span className="text-foreground">launch your own AI twin</span>, Twinly.life is built for you.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth"><Button size="lg" className="w-full sm:w-auto">Create free account</Button></Link>
          <Link to="/auth"><Button size="lg" variant="outline" className="w-full sm:w-auto">Apply as a creator</Button></Link>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">No credit card required · Cancel anytime · 18+</p>
      </div>
    </section>
  );
}
