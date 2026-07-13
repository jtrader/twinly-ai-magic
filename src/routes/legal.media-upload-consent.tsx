import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/media-upload-consent")({
  head: () => ({
    meta: [
      { title: "Media Upload Consent Notice — Twinly.life" },
      { name: "description", content: "What you're confirming when you upload photographs, audio, video, or other media to Twinly.life for AI interpretation." },
    ],
  }),
  component: () => (
    <AppShell>
      <Legal
        title="Media Upload Consent Notice"
        intro={<p>Displayed immediately before uploading photographs, audio, video, or other media for AI interpretation.</p>}
      >
        <h2>Short notice</h2>
        <p>Before you upload media, please confirm that you understand and agree to the following.</p>

        <h2>What you confirm</h2>
        <ul>
          <li>You are at least <strong>18 years old</strong>, or the minimum legal age required in your location.</li>
          <li>You own the photograph, audio recording, video, or other media file, or you have all rights and permissions needed to upload it to Twinly.</li>
          <li>The uploaded media shows, records, or features <strong>you only</strong>, or you have obtained valid consent from every identifiable person appearing in the media before uploading it.</li>
          <li>The uploaded media does <strong>not</strong> show, record, describe, or feature any child or person under 18, does not include unlawful content, and does not include non-consensual, private, intimate, exploitative, abusive, or hidden-recording content.</li>
          <li>You consent to Twinly using the uploaded media for <strong>AI interpretation</strong>, including analysing images, video, audio, speech, voice, visible features, audible features, metadata, contextual signals, and other media characteristics; generating platform outputs; checking safety compliance; and improving the quality, safety, and functionality of the service where permitted by law.</li>
          <li>If the uploaded media includes your face, body, voice, likeness, movements, speech, or other identifying features, Twinly may process facial, voice, likeness, biometric, or sensitive data as described in the Privacy Policy and Biometric, Facial and Voice Data Consent Notice.</li>
          <li>Twinly may use third-party service providers, including AI, hosting, transcription, speech-analysis, media-processing, moderation, verification, and safety providers, to process the uploaded media for the purposes described above.</li>
          <li>You may withdraw consent or request deletion where available by using the in-product controls or contacting <strong>{LEGAL.contact.privacy}</strong>. Withdrawal will not affect processing that already occurred before withdrawal and may be subject to legal, safety, audit, payment, fraud-prevention, or compliance retention requirements.</li>
          <li>You must not upload media featuring other people for AI interpretation unless Twinly has expressly allowed that use and all required consents have been obtained and recorded.</li>
          <li>This consent does <strong>not</strong> authorise voice cloning, persona creation, synthetic likeness generation, explicit-content generation, or use of another person's identity unless a separate, specific consent flow expressly covers that use.</li>
        </ul>

        <h2>How we record your consent</h2>
        <p>When you accept the media upload consent, Twinly records a timestamped consent event against your account, together with the policy version and, where applicable, the upload context. That record is written to the platform audit log so administrators and you can see when consent was given.</p>

        <h2>Separate consents for other processing</h2>
        <p>Materially different processing — including voice cloning, persona creation, likeness-derived generation, explicit synthetic content, training beyond service operation, or public publication of uploaded media — is covered by its own dedicated consent flow and is not authorised by this notice.</p>
      </Legal>
    </AppShell>
  ),
});