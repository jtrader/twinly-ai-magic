import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";
import { Legal } from "./legal.terms";

export const Route = createFileRoute("/legal/privacy")({
  component: () => (
    <AppShell><Legal title="Privacy Policy">
      <p>Placeholder privacy policy. Chat history is stored to power personas and moderation. Age-gate attestations are logged.</p>
    </Legal></AppShell>
  ),
});