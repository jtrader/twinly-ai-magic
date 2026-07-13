import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/deepfake-policy")({
  head: () => ({ meta: [{ title: "Deepfake & Synthetic Media Policy — Twinly.life" }, { name: "description", content: "Consent-based rules for AI-generated likeness, voice, and identity content on Twinly.life." }] }),
  component: () => (
    <AppShell>
      <Legal title="Deepfake and Synthetic Media Policy">
        <h2>1. Purpose</h2>
        <p>Twinly permits only disclosed, consent-based synthetic media generated within platform controls. This Policy explains our rules for AI-generated media, likeness use, voice use, identity use, and suspected non-consensual synthetic content.</p>
        <h2>2. What synthetic media means</h2>
        <p>Synthetic media includes any image, video, audio, voice note, message, avatar, persona output, animation, likeness-derived asset, or other content that is generated, altered, simulated, cloned, enhanced, or materially assisted by artificial intelligence or similar technology.</p>
        <h2>3. Consent is mandatory</h2>
        <p>No synthetic content may be generated using any individual's likeness, voice, face, body, name, identity, persona, biographical identity, or recognisable characteristics unless Twinly has a documented, revocable <strong>ConsentRecord</strong> from that individual covering the relevant use. A creator's participation in Twinly does not authorise use of any third party's likeness, voice, identity, or private material.</p>
        <h2>4. No third-party synthetic media</h2>
        <p>You must not use Twinly tools to generate synthetic media of any non-creator, public figure, private person, ex-partner, colleague, celebrity, supporter, employee, or other third party unless Twinly has expressly approved a valid consent process for that individual.</p>
        <h2>5. Identity exposure and likeness divergence</h2>
        <p>Twinly may provide identity-exposure, likeness-divergence, similarity-scoring, or persona-configuration controls. These tools help manage how closely a persona appears or sounds to a creator's real identity. They do not replace consent — a lower similarity setting, divergence setting, stylisation, pseudonym, or persona tier does not authorise use of another person's likeness, voice, identity, or personal data.</p>
        <h2>6. Reporting suspected non-consensual synthetic media</h2>
        <p>Anyone depicted or affected by suspected non-consensual synthetic media may report it through <strong>LeakReport</strong>, in-product reporting, or <strong>{LEGAL.contact.deepfake}</strong>. A reporter does not need to be a Twinly user.</p>
        <h2>7. Enforcement</h2>
        <p>Suspected non-consensual synthetic media may be removed, restricted, escalated, preserved, reviewed under expedited procedures, or referred to law enforcement where appropriate.</p>
        <h2>8. Jurisdiction-specific laws</h2>
        <p>Synthetic-media, deepfake, image-abuse, privacy, publicity-rights, and biometric laws vary by jurisdiction. Twinly may apply local rules, additional consent steps, extra disclosures, blocking, reporting, or removal standards where required.</p>
      </Legal>
    </AppShell>
  ),
});