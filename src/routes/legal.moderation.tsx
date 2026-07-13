import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/moderation")({
  head: () => ({ meta: [{ title: "Moderation, Suspension & Account-Termination Procedures — Twinly.life" }, { name: "description", content: "How Twinly.life reviews content, enforces policies, handles appeals, and retains moderation records." }] }),
  component: () => (
    <AppShell>
      <Legal title="Moderation, Suspension and Account-Termination Procedures">
        <h2>1. Purpose</h2>
        <p>These Procedures explain how Twinly reviews content, enforces policies, handles appeals, suspends or terminates accounts, and retains moderation records.</p>
        <h2>2. Content review</h2>
        <p>Generated content may pass through pending-review queues, automated checks, human moderation, risk scoring, sampling, post-publication review, user reporting, or escalation workflows before or after publication.</p>
        <h2>3. Grounds for action</h2>
        <ul>
          <li>child-safety violations or age-verification issues;</li>
          <li>non-consensual content or suspected non-consensual synthetic media;</li>
          <li>unlawful content;</li>
          <li>fraud, payment abuse, chargeback abuse, tax-documentation issues, or sanctions concerns;</li>
          <li>harassment, hate, threats, doxxing, extortion, or blackmail;</li>
          <li>scraping, leaking, redistribution, resale, or IP infringement;</li>
          <li>impersonation or unauthorised agency activity;</li>
          <li>attempts to bypass explicitness ceilings, consent gates, AI disclosure, moderation, or age verification;</li>
          <li>repeated or serious policy violations.</li>
        </ul>
        <h2>4. Immediate-action categories</h2>
        <p>Twinly may take immediate action without prior warning for child-safety risks, suspected CSAM, non-consensual synthetic media, fraud, threats, extortion, unlawful activity, severe harassment, payment abuse, security abuse, or conduct creating serious risk to users, Twinly, payment partners, or third parties.</p>
        <h2>5. Warned or appealable categories</h2>
        <p>For less severe or first-time issues, Twinly may issue warnings, remove content, limit features, require edits, request verification, or provide an opportunity to appeal. Twinly is not required to provide warnings where immediate action is justified.</p>
        <h2>6. Appeals</h2>
        <p>Creators or supporters may appeal eligible moderation decisions by emailing <strong>{LEGAL.contact.appeals}</strong> within <strong>14 days</strong> of the decision. Appeals should include the account, content ID, decision being appealed, explanation, and supporting evidence. Twinly aims to review appeals within <strong>10 business days</strong>, subject to volume, complexity, safety risk, and legal constraints. Some decisions may be final where required by law, safety, payment-processor rules, or risk assessment.</p>
        <h2>7. Data handling after termination</h2>
        <p>After account termination or closure, Twinly may delete, anonymise, restrict, retain, or preserve data according to the Privacy Policy, Biometric Consent Notice, Creator Licence Agreement, legal obligations, tax requirements, payment records, fraud prevention, safety, audit logs, and dispute-resolution needs. For creators, termination may affect published content, active subscribers, future generation, persona pages, consent-cascade status, and outstanding payouts. For supporters, termination may affect subscriptions, unlocked content, messages, profile data, and refunds.</p>
        <h2>8. Law-enforcement cooperation</h2>
        <p>Twinly may preserve records, report content, or cooperate with law enforcement, regulators, courts, payment processors, hosting providers, safety organisations, or other competent authorities where required or appropriate.</p>
        <h2>9. Record-keeping and audit logs</h2>
        <p>Twinly may retain moderation decisions, reviewer notes, evidence, user reports, appeals, account actions, payout holds, consent records, revocation records, system flags, and audit logs for compliance, safety, fraud prevention, legal defence, and dispute-resolution purposes.</p>
        <h2>10. Abuse of reporting systems</h2>
        <p>Users must not submit false, abusive, retaliatory, automated, or bad-faith reports. Misuse of reporting tools may result in enforcement action.</p>
      </Legal>
    </AppShell>
  ),
});