import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";
import { LEGAL } from "@/lib/legal-config";

export const Route = createFileRoute("/legal/acceptable-use")({
  head: () => ({ meta: [{ title: "Acceptable Use & Prohibited Content — Twinly.life" }, { name: "description", content: "What is not allowed on Twinly.life and how the platform enforces its rules." }] }),
  component: () => (
    <AppShell>
      <Legal title="Acceptable Use and Prohibited Content Policy">
        <h2>1. Purpose</h2>
        <p>This Policy explains what is not allowed on Twinly. It applies to creators, supporters, agencies, admins, uploaded materials, generated outputs, prompts, messages, profile text, voice, images, videos, live content, reports, metadata, account behaviour, and attempts to use the service.</p>
        <h2>2. Absolute child-safety prohibition</h2>
        <p>Twinly has zero tolerance for content involving minors. You must not upload, request, generate, possess, solicit, describe, role-play, distribute, or attempt to create any sexual, exploitative, suggestive, abusive, grooming-related, or age-ambiguous content involving a person who is, appears to be, is described as, is implied to be, or is role-played as under 18. This prohibition applies regardless of artistic style, fictional framing, AI generation, animation, cosplay, fantasy, disclaimers, age-play, or claims that no real child is involved.</p>
        <h2>3. Consent and non-consensual content</h2>
        <p>You must not upload, request, generate, distribute, or attempt to create content using any person's likeness, voice, image, identity, persona, private information, or biometric characteristics unless the required documented and revocable <strong>ConsentRecord</strong> exists and remains valid. You must not use Twinly to create or distribute non-consensual intimate content, non-consensual synthetic media, sexualised impersonations, revenge pornography, coerced content, hidden-camera content, or material suggesting a person participated in sexual or intimate activity without consent.</p>
        <h2>4. Persona limits and explicitness ceiling</h2>
        <p>Each persona is subject to platform-enforced limits, including an <strong>explicitness ceiling</strong>. You must not attempt to exceed, bypass, misclassify, jailbreak, manipulate, or prompt around a persona's explicitness ceiling or other safety settings. The explicitness ceiling is a technical safeguard, not the only safeguard — content may still be prohibited even if a technical system does not block it.</p>
        <h2>5. Harassment, hate and abuse</h2>
        <p>You must not use Twinly to harass, threaten, blackmail, extort, humiliate, doxx, stalk, shame, degrade, or target any creator, supporter, employee, agency, or third party. You must not promote hatred, abuse, dehumanisation, or violence based on protected characteristics or identity.</p>
        <h2>6. Circumvention, fraud and security abuse</h2>
        <p>You must not circumvent age verification, payment systems, consent gates, AI disclosure labels, moderation queues, rate limits, geo-restrictions, access controls, creator permissions, agency scopes, or platform security. You must not use stolen payment credentials, manipulate chargebacks, create false accounts, launder funds, evade sanctions screening, or misrepresent tax or payout information.</p>
        <h2>7. Scraping, redistribution and resale</h2>
        <p>You must not scrape, crawl, copy, download, resell, leak, mirror, redistribute, train models on, index, or commercially exploit creator content, generated content, supporter interactions, or platform data except as expressly permitted by Twinly in writing.</p>
        <h2>8. Impersonation</h2>
        <p>You must not impersonate a creator's <strong>Real Me</strong> identity, Twinly staff, another user, a public figure, or any third party. Third parties may not create or manage a creator identity unless authorised through approved agency or representative tools.</p>
        <h2>9. Reporting violations</h2>
        <p>Violations may be reported through in-product reporting tools, <strong>TakedownRequest</strong>, <strong>LeakReport</strong>, or <strong>{LEGAL.contact.support}</strong>. Reports involving suspected non-consensual synthetic media, child-safety issues, threats, or criminal conduct may receive expedited review.</p>
        <h2>10. Consequences</h2>
        <p>Violations may result in content removal, feature restrictions, payout holds, account suspension, account termination, reporting to payment processors, preservation of evidence, law-enforcement referral, or other action under the Moderation, Suspension and Account-Termination Procedures.</p>
      </Legal>
    </AppShell>
  ),
});