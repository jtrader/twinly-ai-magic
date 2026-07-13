import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "@/components/twinly/LegalPage";

export const Route = createFileRoute("/legal/ai-disclosure")({
  head: () => ({ meta: [{ title: "AI Disclosure, Labelling and Watermarking Terms — Twinly.life" }, { name: "description", content: "How Twinly labels AI-generated content and why disclosure cannot be disabled." }] }),
  component: () => (
    <AppShell>
      <Legal title="AI Disclosure, Labelling and Watermarking Terms">
        <h2>1. Purpose</h2>
        <p>Twinly is built around disclosed AI persona interactions. These Terms explain how AI-generated outputs are labelled and why disclosure cannot be disabled.</p>
        <h2>2. Mandatory AI-generated flag</h2>
        <p>Every AI-generated message, voice note, image, video, or other generated asset is assigned a server-set <strong>is_ai_generated</strong> flag or equivalent disclosure marker. This marker is controlled by Twinly and is not a creator setting. Creators, supporters, agencies, and third parties must not remove, hide, falsify, crop, obscure, alter, disable, or misrepresent AI disclosure markers.</p>
        <h2>3. Real Me vs. AI personas</h2>
        <p><strong>Real Me</strong> chats are direct exchanges with the verified creator, with no AI in the loop. <strong>Every AI persona</strong> (Nice, Naughty, Wicked, and custom tiers) is clearly labelled and marked as AI on every message.</p>
        <h2>4. Supporter-facing disclosure</h2>
        <ul>
          <li>a persistent chat header showing the active persona type;</li>
          <li>per-message AI badges or labels;</li>
          <li>asset-level labels for generated images, video, voice, or media;</li>
          <li>screenshot-resistant visible labels where implemented.</li>
        </ul>
        <p>We do not represent that a disclosure treatment is active unless the product actually implements it.</p>
        <h2>5. Platform invariant</h2>
        <p>AI disclosure is mandatory. It cannot be disabled by creators, supporters, agencies, or admins except where needed for internal testing, safety, or compliance in non-public environments.</p>
        <h2>6. Watermarking and metadata</h2>
        <p>Twinly's current watermarking and metadata approach is: <strong>visible on-image and in-chat disclosure labels only</strong>. Invisible/steganographic watermarking and cryptographic content-provenance metadata (e.g. C2PA) are <strong>planned but not currently active</strong>. Until they are, Twinly does not claim that generated assets are watermarked, traceable, tamper-proof, screenshot-proof, or persistently labelled outside the platform.</p>
        <h2>7. Difference between AI disclosure and likeness controls</h2>
        <p>AI disclosure tells users that an output was generated or AI-assisted. Identity-exposure, likeness-divergence, and similarity controls manage how closely a persona resembles or exposes a creator's real identity. These systems serve different purposes and do not substitute for each other.</p>
      </Legal>
    </AppShell>
  ),
});