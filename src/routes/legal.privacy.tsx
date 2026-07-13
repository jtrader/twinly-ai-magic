import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Twinly.life" }, { name: "description", content: "How Twinly.life collects, uses, shares, and protects personal data for creators and supporters." }] }),
  component: () => (
    <AppShell>
      <Legal title="Privacy Policy">
        <h2>1. Who this Policy applies to</h2>
        <p>This Privacy Policy explains how <strong>{LEGAL.company.legalName}</strong> collects, uses, shares, stores, and protects personal data in connection with Twinly.life. It applies to creators, supporters, agencies, website visitors, reporters, and other individuals who interact with us.</p>

        <h2>2. Controller and contact details</h2>
        <p>The controller is <strong>{LEGAL.company.legalName}</strong> ({LEGAL.company.identifierLabel} {LEGAL.company.identifier}), {LEGAL.company.registeredOffice} Privacy questions may be sent to <strong>{LEGAL.contact.privacy}</strong>. UK, EU representative, and Data Protection Officer designations will be added after counsel review if required.</p>

        <h2>3. Personal data we collect</h2>
        <ul>
          <li><strong>Account and identity data:</strong> name, username, email, phone number, date of birth, age-verification status, identity-verification results, account role, login credentials, and security records.</li>
          <li><strong>Creator onboarding data:</strong> creator profile information, questionnaire responses, persona settings, consent records, agency assignments, payout details, tax information, and creator configuration.</li>
          <li><strong>Supporter profile data:</strong> preferences, questionnaire responses, chat preferences, interaction history, subscription status, and in-product profile fields.</li>
          <li><strong>Uploaded media:</strong> photos, videos, voice samples, source recordings, documents, verification images, profile assets, and other materials supplied by users.</li>
          <li><strong>Generated content:</strong> AI-generated messages, voice, images, video, persona outputs, labels, metadata, prompts, system-safety flags, and moderation state.</li>
          <li><strong>Payment and commercial data:</strong> purchase history, subscription status, tips, pay-per-view unlocks, live-call charges, refunds, chargebacks, payout records, referral records, and processor identifiers.</li>
          <li><strong>Usage and engagement data:</strong> device data, logs, IP address, browser type, pages viewed, session activity, interactions, clicks, performance data, safety signals, and support communications.</li>
          <li><strong>Inferred preference signals:</strong> engagement patterns and inferred interests used to personalise, rank, recommend, moderate, or operate the service.</li>
          <li><strong>Reports and complaints:</strong> TakedownRequest, LeakReport, evidence uploads, statements, review notes, and correspondence.</li>
        </ul>

        <h2>4. How we use personal data</h2>
        <ul>
          <li>provide, operate, personalise, and secure Twinly;</li>
          <li>verify age, identity, creator eligibility, and account permissions;</li>
          <li>create, configure, generate, label, moderate, and deliver AI persona experiences;</li>
          <li>process payments, subscriptions, payouts, referrals, refunds, taxes, and fraud checks;</li>
          <li>manage consent, revocation, agency delegation, and creator permissions;</li>
          <li>enforce policies, investigate reports, prevent abuse, and protect users;</li>
          <li>comply with law, regulatory duties, payment-network rules, and lawful requests;</li>
          <li>communicate service, safety, legal, billing, and support information;</li>
          <li>improve features, reliability, safety, and user experience.</li>
        </ul>

        <h2>5. AI data classification</h2>
        <p>Twinly uses internal data-classification rules to reduce unnecessary exposure of personal data to AI systems: <strong>prompt-safe</strong> data may be used in AI context; <strong>server-only</strong> data is stored but not normally sent to prompts; <strong>never-stored-in-prompt</strong> data is handled through restricted workflows. These are operational safeguards and do not remove your privacy rights.</p>

        <h2>6. Lawful bases</h2>
        <p>Where UK/EU GDPR applies we rely on performance of a contract, consent, legitimate interests, legal obligation, and — for special-category or biometric processing — explicit consent or another applicable condition. For Australia the Privacy Act 1988 and the Australian Privacy Principles apply. Counsel must insert local privacy-law terminology, consent standards, cross-border disclosure wording, access/correction processes, complaint routes, retention requirements, direct-marketing rules, and any sensitive-information conditions for Hong Kong, Singapore, and New Zealand before launch.</p>

        <h2>7. Biometric, facial and voice data</h2>
        <p>Facial images, video, voice recordings, similarity scores, voice-cloning inputs, and related data may be biometric or special-category data in some jurisdictions. Our separate <strong>Biometric, Facial and Voice Data Consent Notice</strong> explains this processing.</p>

        <h2>8. Third-party processors and sharing</h2>
        <ul>
          <li><strong>AI and generation providers:</strong> {LEGAL.aiProviders.join("; ")}.</li>
          <li><strong>Payment processors:</strong> {LEGAL.payment.primary}.</li>
          <li><strong>Hosting and infrastructure providers:</strong> {LEGAL.hostingProviders.join("; ")}.</li>
          <li><strong>Verification providers:</strong> {LEGAL.verificationProviders.join("; ")}.</li>
          <li><strong>Support, analytics and communications providers:</strong> operational email delivery and product analytics providers to be listed here as they are added.</li>
          <li><strong>Professional advisers and authorities:</strong> where necessary for legal, tax, audit, safety, enforcement, or regulatory purposes.</li>
        </ul>
        <p>We require processors to handle personal data under appropriate contractual safeguards.</p>

        <h2>9. Cross-site LoveKey ecosystem data sharing</h2>
        <p>Twinly may use a shared identity and consent layer backed by the LoveKey ecosystem, including the RSP-backed shared identity and consent architecture. This may allow identity, consent status, revocation status, and related account state to sync between Twinly.life and other LoveKey ecosystem products. We will disclose the specific connected products and obtain any additional consent required before enabling cross-service sharing where required by law.</p>

        <h2>10. Retention</h2>
        <p>We keep personal data for as long as needed to provide the service, maintain accounts, comply with law, resolve disputes, protect safety, process payments and payouts, enforce policies, and maintain audit records. For inactive supporter accounts, Twinly operates a <strong>90-day automatic purge process</strong>, resetting on login, paid activity, active subscription, support ticket, or new message. The purge deletes the supporter profile fields, preference data, chat history, generated content, drafts, media, and logs — except information we must retain for legal, tax, payment, fraud, safety, audit, dispute, or compliance purposes. Creator account data, generated content, consent records, payout records, moderation records, and safety logs are subject to longer retention.</p>

        <h2>11. Your rights</h2>
        <p>Depending on your location, you may have rights to access, correct, delete, restrict, object to, or port your personal data, and to withdraw consent where processing is based on consent. Supporters and creators can manage many profile settings in-product; other requests can be sent to <strong>{LEGAL.contact.privacy}</strong>.</p>

        <h2>12. Consent withdrawal</h2>
        <p>Where processing depends on consent, you may withdraw consent through in-product controls or by contacting us. Withdrawal does not affect processing before withdrawal. For likeness, facial, voice, or persona consent, withdrawal triggers the consent-cascade flagging process described in the relevant consent documents.</p>

        <h2>13. International transfers</h2>
        <p>We may transfer personal data outside your country. Where required we use adequacy regulations, standard contractual clauses, UK international data transfer agreements, or other lawful mechanisms.</p>

        <h2>14. Cookies and similar technologies</h2>
        <p>Twinly may use cookies, local storage, pixels, SDKs, and similar technologies for login, security, preferences, analytics, payment flows, fraud prevention, and service operation. Where required, non-essential cookies will be used only with consent.</p>

        <h2>15. Children's privacy</h2>
        <p>Twinly is not for minors. We do not knowingly collect personal data from anyone under 18. If we learn that a minor has used the service or submitted personal data, we will take appropriate action, which may include account closure, deletion, reporting, and preservation where legally required.</p>

        <h2>16. Complaints</h2>
        <p>You may contact us at <strong>{LEGAL.contact.privacy}</strong>. Australian users may also complain to the Office of the Australian Information Commissioner (OAIC). If UK or EU data-protection law applies, you may complain to the UK ICO or your local supervisory authority.</p>
      </Legal>
    </AppShell>
  ),
});