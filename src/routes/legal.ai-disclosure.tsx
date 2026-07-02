import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "./legal.terms";

export const Route = createFileRoute("/legal/ai-disclosure")({
  component: () => (
    <AppShell><Legal title="AI disclosure">
      <p><strong>Real Me</strong> chats are direct with the verified creator, with no AI in the loop.</p>
      <p><strong>Every AI persona</strong> is clearly labeled and marked as AI on every message. AI personas are trained on official creator content and moderated by that creator's rules.</p>
      <p>Voice, image, and video generation are coming later and only launch with explicit creator consent.</p>
    </Legal></AppShell>
  ),
});