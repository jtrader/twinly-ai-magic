import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <AppShell>
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-brand-glow" />
        <h1 className="mt-4 font-display text-2xl font-bold">
          {session_id ? "Subscription complete" : "All done"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your subscription is being confirmed. You'll see it in your account momentarily.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link to="/account/subscriptions">View my subscriptions</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/discover">Keep exploring</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}