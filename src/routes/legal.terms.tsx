import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";

export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <div className="mt-4 space-y-4 text-sm text-muted-foreground">{children}</div>
    </article>
  );
}

export const Route = createFileRoute("/legal/terms")({
  component: () => (
    <AppShell><Legal title="Terms of Service">
      <p>Placeholder MVP terms. Twinly.ai is 18+. Content is provided by verified creators. AI personas are clearly disclosed on every message.</p>
    </Legal></AppShell>
  ),
});