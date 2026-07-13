import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";

export const Route = createFileRoute("/legal/child-safety")({
  head: () => ({ meta: [{ title: "Child-Safety & Age-Verification Rules — Twinly.life" }, { name: "description", content: "Zero-tolerance child-safety rules and how age assurance is applied on Twinly.life." }] }),
  component: () => (
    <AppShell>
      <Legal title="Child-Safety and Age-Verification Rules">
        <h2>1. Adults only</h2>
        <p>Twinly is only for adults. The minimum age is 18, or any higher age required by applicable law in the user's location. Some jurisdictions may require higher minimum ages, additional age assurance, or additional access controls.</p>
        <h2>2. Age verification</h2>
        <p>Twinly may require age and identity verification through its ID verification pipeline before account creation, before supporter access, before creator activation, before paid activity, before adult content access, or at any other risk-based point. Failed, incomplete, suspicious, inconsistent, or refused verification may result in denial of access, suspension, termination, payout hold, content restriction, or escalation.</p>
        <h2>3. Zero tolerance for minors in content</h2>
        <p>No persona, real person, AI-generated character, fictional character, avatar, role-play identity, profile, prompt, image, video, voice, or message may be depicted, described, implied, suggested, presented, or treated as a minor in a sexual, intimate, exploitative, age-play, grooming, abusive, or adult-content context. This applies even if the content is fictional, generated, stylised, cartoon-like, fantasy-based, or labelled as adult.</p>
        <h2>4. No minor personas</h2>
        <p>Creators may not configure, name, describe, style, dress, market, or present a persona as under 18 or age-ambiguous. Supporters may not prompt, request, or steer a persona into minor-coded content.</p>
        <h2>5. Suspected CSAM and unlawful content</h2>
        <p>Twinly will escalate suspected child sexual abuse material, grooming, sexual exploitation, extortion, trafficking, or related unlawful conduct. Reporting obligations vary by jurisdiction and may include NCMEC (US), UK law enforcement and the Internet Watch Foundation, the Australian eSafety Commissioner, payment processors, hosting providers, or other authorities; counsel-confirmed reporting channels are maintained internally.</p>
        <h2>6. Staff training and escalation</h2>
        <p>Twinly maintains internal staff and moderator training for child-safety identification, escalation, evidence preservation, urgent review, and law-enforcement cooperation. Public-facing summaries deliberately omit operational details that would help bad actors evade detection.</p>
        <h2>7. Circumvention</h2>
        <p>Attempting to bypass age verification, use another person's ID, submit false information, access through a minor, provide access to a minor, or otherwise circumvent child-safety controls may result in immediate suspension or termination and possible reporting.</p>
      </Legal>
    </AppShell>
  ),
});