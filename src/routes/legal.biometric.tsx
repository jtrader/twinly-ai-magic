import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/biometric")({
  head: () => ({ meta: [{ title: "Biometric, Facial & Voice Data Consent Notice — Twinly.life" }, { name: "description", content: "How Twinly.life collects and uses facial, voice, likeness, and similarity data." }] }),
  component: () => (
    <AppShell>
      <Legal title="Biometric, Facial and Voice Data Consent Notice">
        <h2>1. Purpose</h2>
        <p>This Notice explains how Twinly collects and uses facial, voice, likeness, similarity, and related data. It is separate from the general Privacy Policy because biometric, facial, and voice data may receive special protection under UK GDPR, EU GDPR, the Australian Privacy Act (sensitive information), and other biometric privacy laws.</p>
        <h2>2. Data covered</h2>
        <ul>
          <li>facial photos, images, video, and visual source materials;</li>
          <li>voice recordings and <strong>VoiceSourceRecording</strong> files;</li>
          <li>voice-cloning inputs, embeddings, models, or derived voice features;</li>
          <li>likeness-comparison and identity-exposure data;</li>
          <li>similarity scores, divergence settings, and persona configuration signals;</li>
          <li>consent records, revocation records, and audit logs linked to this data.</li>
        </ul>
        <h2>3. Purposes</h2>
        <ul>
          <li>creating and operating creator-authorised AI personas;</li>
          <li>generating creator-authorised image, video, voice, or likeness-derived content;</li>
          <li>similarity scoring and identity-exposure controls;</li>
          <li>voice cloning where expressly authorised;</li>
          <li>consent verification and revocation handling;</li>
          <li>safety, moderation, fraud prevention, and compliance.</li>
        </ul>
        <p>We do <strong>not</strong> use this data for credit scoring, employment or insurance decisions, unrelated identity surveillance, or sale to data brokers.</p>
        <h2>4. Consent mechanism</h2>
        <p>Before collecting or using facial, voice, likeness, or similar data for persona generation or voice cloning, Twinly requires a documented <strong>ConsentRecord</strong> and, where applicable, a <strong>VoiceSourceRecording</strong> consent gate. Consent must be affirmative, specific, informed, and revocable.</p>
        <h2>5. Revocation</h2>
        <p>You may revoke consent through the in-product persona and voice settings, or by contacting <strong>{LEGAL.contact.privacy}</strong>. Revocation triggers Twinly's consent-cascade process, which flags affected personas, generated content, voice outputs, likeness-derived assets, or related uses for review. Current implementation: the consent-cascade process flags affected content but does not automatically delete all derivative generated content. Deletion, blocking, or delisting is performed on a case-by-case basis subject to legal, safety, and creator-instruction review.</p>
        <h2>6. Retention</h2>
        <p>Twinly retains biometric, facial, and voice data only for as long as necessary for the authorised purposes, legal obligations, safety, dispute resolution, audit, or compliance. The detailed retention schedule (facial source images/video, VoiceSourceRecording files, voice-cloning features/embeddings, similarity scores, and consent/revocation logs) is maintained internally and will be published here after Privacy/Product sign-off.</p>
        <h2>7. No sale</h2>
        <p>Twinly does not sell biometric, facial, or voice data.</p>
        <h2>8. Questions</h2>
        <p>Questions or revocation requests may be sent to <strong>{LEGAL.contact.privacy}</strong>.</p>
      </Legal>
    </AppShell>
  ),
});