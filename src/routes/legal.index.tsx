import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { DraftBanner } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

const DOCS = [
  { to: "/legal/terms", title: "1. Website Terms of Use", desc: "Master terms for access to Twinly.life, personas, paid features, and disputes." },
  { to: "/legal/acceptable-use", title: "2. Acceptable Use & Prohibited Content", desc: "What is not allowed on the platform and how violations are handled." },
  { to: "/legal/deepfake-policy", title: "3. Deepfake & Synthetic Media Policy", desc: "Consent-based rules for AI-generated likeness, voice, and identity content." },
  { to: "/legal/privacy", title: "4. Privacy Policy", desc: "What personal data we collect, how we use it, and your privacy rights." },
  { to: "/legal/biometric", title: "5. Biometric, Facial & Voice Data Consent Notice", desc: "Special-category data collected for personas and voice cloning." },
  { to: "/legal/likeness", title: "6. Likeness & Personality-Rights Consent Agreement", desc: "Creator authorisation for use of their likeness, voice, and identity." },
  { to: "/legal/copyright", title: "7. Copyright & IP Complaint Procedure", desc: "How to report copyright, trade mark, or publicity-rights infringement." },
  { to: "/legal/takedown", title: "8. Deepfake Removal & Takedown Policy", desc: "Expedited reporting route for suspected non-consensual synthetic media." },
  { to: "/legal/creator-licence", title: "9. Creator Licence Agreement", desc: "The agreement that governs creators, revenue share, payouts, and obligations." },
  { to: "/legal/child-safety", title: "10. Child-Safety & Age-Verification Rules", desc: "Zero-tolerance rules and how age assurance is applied." },
  { to: "/legal/ai-disclosure", title: "11. AI Disclosure, Labelling & Watermarking Terms", desc: "How AI-generated content is labelled and why disclosure cannot be disabled." },
  { to: "/legal/moderation", title: "12. Moderation, Suspension & Account-Termination Procedures", desc: "How content is reviewed, how appeals work, and what happens on termination." },
  { to: "/legal/media-upload-consent", title: "13. Media Upload Consent Notice", desc: "What you're confirming when you upload photos, audio, or video for AI interpretation." },
] as const;

export const Route = createFileRoute("/legal/")({
  head: () => ({ meta: [{ title: "Legal & policies — Twinly.life" }, { name: "description", content: "The full Twinly.life legal and policy suite: terms, privacy, AI disclosure, consent, takedown, and creator agreements." }] }),
  component: () => (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold">Legal &amp; policies</h1>
        <p className="mt-2 text-sm text-muted-foreground">Baseline jurisdiction: {LEGAL.company.jurisdiction}. Effective {LEGAL.effectiveDate}. Additional launch jurisdictions (Hong Kong, Singapore, New Zealand, Australia) require local counsel sign-off before enabling users in those locations; where local law requires a stricter or more user-protective standard, that standard controls.</p>
        <div className="mt-4"><DraftBanner /></div>
        <ul className="mt-6 space-y-3">
          {DOCS.map((d) => (
            <li key={d.to}>
              <Link to={d.to} className="block rounded-lg border border-border bg-surface-elevated p-4 hover:border-brand/50">
                <div className="font-semibold text-foreground">{d.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{d.desc}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  ),
});