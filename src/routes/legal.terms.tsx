import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

// Re-export for legacy imports from other legal route files.
export { Legal } from "@/components/twinly/LegalPage";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({ meta: [{ title: "Website Terms of Use — Twinly.life" }, { name: "description", content: "The terms that govern access to Twinly.life, its AI personas, subscriptions, and paid features." }] }),
  component: () => (
    <AppShell>
      <Legal title="Website Terms of Use">
        <h2>1. Who we are</h2>
        <p>Twinly.life is operated by <strong>{LEGAL.company.legalName}</strong>, registered in <strong>{LEGAL.company.jurisdiction}</strong> ({LEGAL.company.identifierLabel} {LEGAL.company.identifier}). References to <strong>Twinly</strong>, <strong>we</strong>, <strong>us</strong> and <strong>our</strong> mean that company. Registered office: {LEGAL.company.registeredOffice}</p>

        <h2>2. What these Terms cover</h2>
        <p>These Terms govern access to and use of Twinly.life, including creator profiles, AI personas, supporter accounts, chat, voice, media generation, paid features, subscriptions, pay-per-view unlocks, tips, live calls, live streams, referrals, reporting tools, and related services.</p>
        <p>Additional terms may apply to particular users or features, including the Acceptable Use and Prohibited Content Policy, Deepfake and Synthetic Media Policy, Privacy Policy, Biometric, Facial and Voice Data Consent Notice, Likeness and Personality-Rights Consent Agreement, Copyright and IP Complaint Procedure, Deepfake Removal and Takedown Policy, Creator Licence Agreement, Child-Safety and Age-Verification Rules, AI Disclosure, Labelling and Watermarking Terms, and Moderation, Suspension and Account-Termination Procedures. If there is a conflict between these Terms and a feature-specific policy, the feature-specific policy applies to that feature unless it says otherwise.</p>

        <h2>3. Eligibility and age verification</h2>
        <p>Twinly is for adults only. You must be at least <strong>18 years old</strong>, or any higher age required by applicable law in your location, to create an account, access adult content, act as a creator, support a creator, or use paid features. We may require identity and age verification during onboarding, before payments, before creator activation, before supporter access to age-restricted features, or at any other time. We may refuse, suspend, or terminate access if verification fails, is incomplete, appears fraudulent, or suggests attempted circumvention.</p>

        <h2>4. Account types</h2>
        <ul>
          <li><strong>Creator:</strong> a verified adult who creates, configures, and monetises disclosed AI personas based on their own authorised likeness, voice, identity, profile inputs, and content.</li>
          <li><strong>Supporter:</strong> a verified adult who subscribes to, pays for, unlocks, tips, chats with, or otherwise interacts with creator personas and content.</li>
          <li><strong>Agency:</strong> an organisation or representative authorised to manage specified creator functions through scoped permissions.</li>
          <li><strong>Admin:</strong> a Twinly-operated account used for platform operations, moderation, compliance, support, safety, and technical administration.</li>
        </ul>
        <p>You are responsible for maintaining accurate account information, protecting login credentials, and ensuring all activity under your account complies with these Terms.</p>

        <h2>5. The service</h2>
        <p>Twinly is an AI persona platform. Creators may build disclosed AI personas, including <strong>Real Me, Nice, Naughty, Wicked</strong>, and custom tiers where available. These personas may interact with supporters through chat, voice, generated images, generated video, live calls, live streams, and other media features. AI personas are synthetic or AI-assisted experiences. They are not a guarantee that a creator personally wrote, spoke, appeared in, approved, or viewed every individual interaction, except where the service expressly states otherwise.</p>

        <h2>6. Mandatory AI disclosure</h2>
        <p>AI-generated messages, voice notes, images, videos, and other generated assets are labelled through server-enforced disclosure systems. Creators and supporters must not remove, obscure, bypass, falsify, or misrepresent Twinly's AI disclosure labels, AI-generated flags, badges, asset labels, headers, metadata, or other disclosure mechanisms.</p>

        <h2>7. Payments, subscriptions, paid unlocks and tips</h2>
        <p>Twinly may offer paid subscriptions, pay-per-view unlocks, tips, live-call billing, live-stream billing, referrals, and other paid features. Prices, taxes, billing intervals, renewal terms, cancellation options, and feature-specific restrictions will be shown before purchase where required. Payments are processed by <strong>{LEGAL.payment.primary}</strong>. Twinly does not receive full card details. Creators' revenue share, payout schedule, thresholds, tax-documentation requirements, adjustments, chargebacks, fraud reviews, and payout holds are governed by the Creator Licence Agreement. Unless the checkout page or applicable law says otherwise, digital services and immediately supplied digital content may begin before the end of any statutory cancellation period only where you give the required consent and acknowledgment.</p>

        <h2>8. User content and intellectual property</h2>
        <p>Twinly and its licensors own the platform, software, interface, workflows, models, systems, trademarks, branding, know-how, and platform-generated technical metadata. Creators retain ownership of their own creator-submitted content and authorised likeness-derived content, subject to the licences granted to Twinly in the Creator Licence Agreement and related consent documents. Supporters retain ownership of content they submit, subject to a licence to Twinly to process, display, moderate, generate responses from, and operate the service. You must not upload or provide material unless you have all rights, permissions, releases, and consents required for Twinly to process it.</p>

        <h2>9. Prohibited conduct</h2>
        <p>You must comply with the Acceptable Use and Prohibited Content Policy. In particular, you must not use Twinly for content involving minors, non-consensual content, unauthorised synthetic media, identity-based hate, harassment, doxxing, scraping, payment fraud, age-verification circumvention, impersonation, or redistribution of creator content.</p>

        <h2>10. No unlawful or unsafe reliance</h2>
        <p>Twinly provides entertainment, creator-support, and synthetic-persona services. It does not provide legal, medical, financial, psychological, emergency, or professional advice. You should not rely on AI persona outputs as factual, professional, or emergency guidance.</p>

        <h2>11. Moderation and enforcement</h2>
        <p>We may review content before or after publication. We may remove content, restrict features, suspend accounts, terminate accounts, preserve evidence, report unlawful activity, cooperate with lawful requests, or take other action described in the Moderation, Suspension and Account-Termination Procedures.</p>

        <h2>12. Termination by users</h2>
        <p>You may close your account using in-product tools where available or by contacting <strong>{LEGAL.contact.support}</strong>. Account closure may affect access to subscriptions, generated content, paid features, creator pages, supporter relationships, and outstanding payouts. Data handling after closure is described in the Privacy Policy and related retention provisions.</p>

        <h2>13. Disclaimers</h2>
        <p>Twinly is provided on an <strong>as is</strong> and <strong>as available</strong> basis. We do not guarantee uninterrupted access, error-free operation, uninterrupted AI generation, specific commercial results, exact likeness fidelity, absence of hallucinations, availability of any creator, or compatibility with every device or jurisdiction. Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence, fraud, fraudulent misrepresentation, or statutory consumer rights (including under the Australian Consumer Law) that cannot be waived.</p>

        <h2>14. Limitation of liability</h2>
        <p>Subject to the preceding clause, Twinly is not liable for indirect, consequential, incidental, special, punitive, exemplary, or business losses, including loss of profit, revenue, goodwill, data, opportunity, or anticipated savings. For consumer users, this limitation applies only to the extent permitted by applicable consumer law. For business users, Twinly's aggregate liability arising from the service is limited to <strong>{LEGAL.liability.cap}</strong> or the amount paid by the user to Twinly in the <strong>{LEGAL.liability.period}</strong> before the event giving rise to the claim, whichever is greater, unless prohibited by law.</p>

        <h2>15. Changes to the service and these Terms</h2>
        <p>We may update the service and these Terms from time to time. We will provide notice of material changes by in-product notice, email, website notice, or another reasonable method. Continued use after the effective date means acceptance of the updated Terms, except where law requires express consent.</p>

        <h2>16. Governing law and disputes</h2>
        <p>These Terms are governed by <strong>{LEGAL.governingLaw}</strong>. <strong>{LEGAL.forum}</strong> will have jurisdiction, subject to any mandatory consumer rights in the user's country of residence. Local counsel in Hong Kong, Singapore, and New Zealand may add arbitration, class-action waiver, consumer ADR, small-claims, platform-to-business, or jurisdiction-specific dispute provisions before enabling users in those jurisdictions.</p>

        <h2>17. Contact</h2>
        <p>Questions about these Terms may be sent to <strong>{LEGAL.contact.support}</strong>.</p>
      </Legal>
    </AppShell>
  ),
});