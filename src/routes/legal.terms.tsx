import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/twinly/AppShell";

function DraftBanner() {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-medium text-amber-200">
      Draft — pre-launch. Placeholder copy shown during public beta; final legal text will replace this before general availability.
    </div>
  );
}

export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <div className="mt-4"><DraftBanner /></div>
      <div className="mt-4 space-y-4 text-sm text-muted-foreground">{children}</div>
    </article>
  );
}

export const Route = createFileRoute("/legal/terms")({
  component: () => (
    <AppShell><Legal title="Terms of Service">
      <p>Placeholder MVP terms. Twinly.life is 18+. Content is provided by verified creators. AI personas are clearly disclosed on every message.</p>
    </Legal></AppShell>
  ),
});