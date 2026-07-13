import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/takedown")({
  head: () => ({ meta: [{ title: "Deepfake Removal & Takedown Policy — Twinly.life" }, { name: "description", content: "Expedited reporting route for suspected non-consensual synthetic media on Twinly.life." }] }),
  component: () => (
    <AppShell>
      <Legal title="Deepfake Removal and Takedown Policy">
        <h2>1. Purpose</h2>
        <p>This Policy provides a dedicated, expedited route for reporting suspected non-consensual synthetic media, including deepfakes, voice clones, likeness simulations, identity misuse, and AI-generated intimate or sexualised content.</p>
        <h2>2. Who can file a report</h2>
        <ul>
          <li>the depicted or identifiable individual;</li>
          <li>a verified authorised representative;</li>
          <li>a parent, guardian, or safeguarding authority where a minor or vulnerable person may be involved;</li>
          <li>law enforcement or another competent authority;</li>
          <li>any user who reasonably believes non-consensual synthetic media is present.</li>
        </ul>
        <p>The depicted individual does not need to be a Twinly user.</p>
        <h2>3. How to report</h2>
        <p>Reports may be submitted through <strong>LeakReport</strong>, in-product reporting, or <strong>{LEGAL.contact.takedown}</strong>. Include where possible URLs, content IDs, account names, screenshots, or descriptions; why the content is believed to be synthetic or non-consensual; whether the reporter is the depicted person or authorised representative; evidence of identity or authority; and urgency information, including threats, extortion, doxxing, blackmail, or child-safety concerns.</p>
        <h2>4. Expedited review</h2>
        <p>Twinly prioritises suspected non-consensual synthetic media. Operational target: {LEGAL.reviewSla} of receipt. This target is a service goal, not a contractual guarantee, and may vary with volume, complexity, and safety risk.</p>
        <h2>5. Possible actions</h2>
        <p>Twinly may remove or disable content, restrict sharing, suspend generation, block accounts, preserve evidence, notify affected users, require additional verification, refer to law enforcement, or take other action appropriate to the risk.</p>
        <h2>6. Child-safety and criminal content</h2>
        <p>Reports involving minors, suspected child sexual abuse material, coercion, blackmail, sexual extortion, threats, or criminal offences will be escalated under Twinly's child-safety and law-enforcement procedures.</p>
        <h2>7. Relationship to other policies</h2>
        <p>This Policy works alongside the Deepfake and Synthetic Media Policy, Acceptable Use and Prohibited Content Policy, Privacy Policy, and Moderation, Suspension and Account-Termination Procedures. Copyright complaints should normally use the Copyright and IP Complaint Procedure unless the issue is also non-consensual synthetic media.</p>
      </Legal>
    </AppShell>
  ),
});