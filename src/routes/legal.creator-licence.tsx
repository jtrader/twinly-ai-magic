import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/creator-licence")({
  head: () => ({ meta: [{ title: "Creator Licence Agreement — Twinly.life" }, { name: "description", content: "The agreement that governs creators, revenue share, payouts, and obligations on Twinly.life." }] }),
  component: () => (
    <AppShell>
      <Legal title="Creator Licence Agreement">
        <p>This Agreement applies to creators who use Twinly to create, configure, publish, monetise, or manage AI personas.</p>
        <h2>1. Creator relationship</h2>
        <p>Creators are independent users of the platform and are not employees, workers, agents, partners, franchisees, or representatives of Twinly unless a separate written agreement expressly says otherwise.</p>
        <h2>2. Creator eligibility</h2>
        <p>To become or remain a creator, you must complete required age and identity verification, provide accurate onboarding information, accept required consent terms, maintain valid payout information, and comply with all Twinly policies.</p>
        <h2>3. Creator content and ownership</h2>
        <p>You retain ownership of content and materials you submit, including authorised likeness-derived content, subject to the rights granted to Twinly. You grant Twinly a worldwide, non-exclusive, transferable, sublicensable, royalty-free licence to host, store, process, reproduce, display, transmit, generate from, adapt, label, moderate, distribute, promote, and otherwise use creator content as necessary to provide, improve, protect, and monetise the service.</p>
        <h2>4. Persona configuration</h2>
        <p>You may configure authorised personas, tiers, settings, content types, and availability where Twinly makes those controls available. Your authority is subject to platform rules, including mandatory AI disclosure, content moderation, explicitness ceiling, consent gates, child-safety prohibitions, and payment rules. The explicitness ceiling and AI disclosure requirement are non-negotiable platform controls. They cannot be disabled, waived, overridden, contracted around, or delegated away.</p>
        <h2>5. Source-material warranties</h2>
        <ul>
          <li>all uploaded photos, videos, voice files, documents, and source materials are lawful;</li>
          <li>the materials depict, record, or relate only to you unless Twinly has separately recorded valid third-party consent;</li>
          <li>you have all rights, releases, permissions, and consents required;</li>
          <li>the materials do not contain minors, non-consensual content, stolen material, or unlawful content;</li>
          <li>your use of Twinly will not infringe IP, privacy, publicity, personality, data-protection, contractual, or other rights.</li>
        </ul>
        <h2>6. Revenue share and payouts</h2>
        <p>Creator revenue share is <strong>{LEGAL.creator.revenueShare}</strong>. Payouts are made <strong>{LEGAL.creator.payoutSchedule}</strong>, subject to a minimum threshold of <strong>{LEGAL.creator.minimumThreshold}</strong>, tax-documentation requirements, identity verification, fraud checks, refunds, chargebacks, payment-processor restrictions, sanctions screening, legal holds, and policy compliance. Twinly may withhold, adjust, reverse, or offset payouts for refunds, chargebacks, fraud, suspected unlawful activity, breach of policy, account suspension, tax issues, or payment-processor requirements.</p>
        <h2>7. Taxes</h2>
        <p>Creators are responsible for their own taxes, filings, registrations, VAT/GST/sales-tax obligations where applicable, income reporting, and professional advice. Twinly may require tax forms, withholding information, and supporting documents before paying or continuing to pay a creator.</p>
        <h2>8. Agency-managed creators</h2>
        <p>A creator may authorise an agency to manage specified functions only through Twinly's approved agency-permission system, including the RSP-backed <strong>AgencyCreatorAssignment</strong> scoped-permission architecture. Agency authority is limited to the permissions granted, may be revoked by the creator or Twinly, and does not allow an agency to waive non-negotiable platform controls, consent requirements, age verification, AI disclosure, child-safety rules, or creator personal consent.</p>
        <h2>9. Creator obligations</h2>
        <ul>
          <li>maintain accurate account, payout, tax, and consent information;</li>
          <li>comply with all platform policies;</li>
          <li>avoid misleading supporters about AI involvement;</li>
          <li>respond to verification or compliance requests;</li>
          <li>ensure all source materials and prompts comply with consent rules;</li>
          <li>cooperate with takedown, safety, and moderation processes.</li>
        </ul>
        <h2>10. Termination and account closure</h2>
        <p>Twinly may suspend or terminate creator access under the Moderation, Suspension and Account-Termination Procedures. A creator may request account closure using available tools or by contacting <strong>{LEGAL.contact.creatorSupport}</strong>. On termination or closure, Twinly may remove or delist creator pages, stop future generation, cancel or migrate subscriber access where lawful and operationally feasible, process outstanding payouts subject to adjustments and holds, retain required records, preserve evidence, and handle published content under the applicable consent, privacy, moderation, and retention rules.</p>
        <h2>11. Survival</h2>
        <p>Clauses concerning ownership, licences, payouts, taxes, warranties, enforcement, records, disputes, limitations, and legal compliance survive termination as necessary.</p>
      </Legal>
    </AppShell>
  ),
});