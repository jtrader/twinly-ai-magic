import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/likeness")({
  head: () => ({ meta: [{ title: "Likeness & Personality-Rights Consent Agreement — Twinly.life" }, { name: "description", content: "Creator authorisation for Twinly.life to use their likeness, voice, and identity." }] }),
  component: () => (
    <AppShell>
      <Legal title="Likeness and Personality-Rights Consent Agreement">
        <p>This Agreement is between <strong>{LEGAL.company.legalName}</strong> ({LEGAL.company.identifierLabel} {LEGAL.company.identifier}) and the verified creator who accepts it.</p>
        <h2>1. Purpose</h2>
        <p>This Agreement authorises Twinly to use the creator's authorised likeness, voice, identity, profile materials, questionnaire responses, and persona configuration to create and operate disclosed AI personas on Twinly.</p>
        <h2>2. Creator confirmations</h2>
        <ul>
          <li>they are the individual depicted, recorded, described, or represented in the source materials;</li>
          <li>they are at least 18 years old or any higher age required by applicable law;</li>
          <li>they have completed Twinly's required identity and age verification;</li>
          <li>the source materials do not depict or include any third party unless Twinly has separately approved and recorded valid consent from that third party;</li>
          <li>they have the legal right to grant this consent.</li>
        </ul>
        <h2>3. Scope of authorisation</h2>
        <ul>
          <li>text-based persona interactions;</li>
          <li>creator-authorised image generation;</li>
          <li>creator-authorised video generation;</li>
          <li>creator-authorised voice generation or voice cloning;</li>
          <li>similarity scoring and identity-exposure controls;</li>
          <li>profile, promotional, recommendation, preview, and subscriber-facing displays.</li>
        </ul>
        <p>This authorisation applies only to the personas, content types, and settings covered by the creator's active <strong>ConsentRecord</strong> and persona configuration.</p>
        <h2>4. Express exclusion for explicit synthetic likeness use</h2>
        <p>Unless Twinly's current implementation and counsel-approved terms expressly say otherwise, this Agreement does <strong>not</strong> authorise explicit or sexually explicit synthetic generation of the creator's likeness. The authorised scope is limited to the non-explicit generation tiers and platform-enforced limits currently implemented.</p>
        <h2>5. AI disclosure and platform limits</h2>
        <p>All creator personas and generated outputs remain subject to Twinly's mandatory AI disclosure, asset labelling, moderation, explicitness ceiling, prohibited-content rules, child-safety rules, and consent controls. These safeguards are platform invariants and cannot be waived by the creator, an agency, or a supporter.</p>
        <h2>6. Revocation</h2>
        <p>The creator may revoke consent at any time through the in-product persona settings or by contacting <strong>{LEGAL.contact.creatorSupport}</strong>. Revocation affects future generation and triggers consent-cascade flagging of affected existing content. Revocation does not automatically unwind payments, completed transactions, historical logs, legally required records, moderation records, tax records, fraud records, or processing that occurred before revocation.</p>
        <h2>7. Compensation</h2>
        <p>Compensation, revenue share, payout timing, minimum thresholds, tax documentation, adjustments, chargebacks, and payout holds are governed by the Creator Licence Agreement.</p>
        <h2>8. Duration and termination</h2>
        <p>This Agreement begins when the creator accepts it and remains in effect until terminated or revoked, subject to survival of provisions needed for legal compliance, dispute resolution, audit, payout, moderation, and enforcement.</p>
        <h2>9. Personality and publicity rights</h2>
        <p>The creator acknowledges that rights of publicity, personality rights, image rights, privacy rights, passing-off, and related rights vary by jurisdiction. This Agreement is intended to document consent to Twinly's authorised use of the creator's likeness, voice, identity, and persona within the service.</p>
      </Legal>
    </AppShell>
  ),
});