import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, HelpCircle, AlertTriangle, Clock, Info, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ChecklistStep = {
  key: string;
  title: string;
  to: string;
  toHash?: string;
  toSearch?: Record<string, string | number>;
  done: boolean;
  optional?: boolean;
  why: string; // Why it matters
  who: string; // Who is involved
  what: string; // What you'll do
  how: string; // How long / how to
  /** Short inline status line rendered under the title, e.g. "60% complete",
   *  "Awaiting admin review", "Verified — Alan Watts", "ID no longer resolves". */
  statusReason?: string;
  /** Colours the inline status line. Defaults to "info". */
  statusTone?: "ok" | "warn" | "error" | "info";
  /** True while server-side validation for this step is still running.
   *  Renders a "Verifying…" skeleton instead of a status line and hides
   *  the Start button until the check resolves. */
  loading?: boolean;
  /** Optional retry action, shown when a step failed validation
   *  (typically tone "warn" / "error"). Lets the user re-run the check
   *  without losing progress or navigating away. */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to "Retry". */
  retryLabel?: string;
};

const TONE_STYLES: Record<NonNullable<ChecklistStep["statusTone"]>, { text: string; Icon: typeof CheckCircle2 }> = {
  ok: { text: "text-emerald-300", Icon: CheckCircle2 },
  warn: { text: "text-amber-300", Icon: Clock },
  error: { text: "text-rose-300", Icon: AlertTriangle },
  info: { text: "text-muted-foreground", Icon: Info },
};

export function SetupChecklist({ steps }: { steps: ChecklistStep[] }) {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  const allDone = doneCount === total;
  const [collapsed, setCollapsed] = useState(allDone);

  if (allDone && collapsed) {
    return (
      <div
        className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3"
        role="status"
      >
        <div className="flex items-center gap-2 text-sm text-emerald-200">
          <CheckCircle2 className="size-4" aria-hidden />
          <span className="font-semibold">Studio setup complete</span>
          <span className="text-emerald-300/70">· {total} of {total} steps done</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setCollapsed(false)}>
          Show checklist
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="setup-checklist-heading"
      className="mb-6 rounded-2xl border border-border bg-surface p-5"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="setup-checklist-heading" className="font-display text-lg font-semibold">
            Set up your AI Twin
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Work through these in order — each step unlocks the next part of your studio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold tabular-nums text-muted-foreground" aria-live="polite">
            {doneCount} of {total} complete
          </div>
          {allDone && (
            <Button size="sm" variant="ghost" onClick={() => setCollapsed(true)}>
              Collapse
            </Button>
          )}
        </div>
      </header>

      <div
        className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </div>

      <ol className="space-y-2">
        {steps.map((step, i) => {
          const isNext = !step.done && i === nextIdx;
          const tone = TONE_STYLES[step.statusTone ?? "info"];
          const showRetry = !!step.onRetry && !step.done && !step.loading
            && (step.statusTone === "warn" || step.statusTone === "error");
          return (
            <li
              key={step.key}
              data-testid={`checklist-step-${step.key}`}
              data-done={step.done ? "true" : "false"}
              data-next={isNext ? "true" : "false"}
              data-loading={step.loading ? "true" : "false"}
              data-status={step.statusTone ?? ""}
              aria-current={isNext ? "step" : undefined}
              className={
                "rounded-xl border p-3 transition " +
                (step.done
                  ? "border-border/60 bg-background/40 opacity-70"
                  : isNext
                    ? "border-brand/50 bg-brand/10"
                    : "border-border bg-background/40")
              }
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0" aria-hidden>
                  {step.done ? (
                    <CheckCircle2 className="size-5 text-emerald-400" />
                  ) : (
                    <div
                      className={
                        "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums " +
                        (isNext ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground")
                      }
                    >
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        "text-sm font-medium " +
                        (step.done ? "text-muted-foreground line-through decoration-muted-foreground/60" : "text-foreground")
                      }
                    >
                      {step.title}
                    </span>
                    {step.optional && !step.done && (
                      <span className="rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Optional
                      </span>
                    )}
                    {step.done && (
                      <span className="sr-only">Step {i + 1} complete</span>
                    )}
                  </div>
                  {step.loading ? (
                    <p
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                      role="status"
                      aria-live="polite"
                      data-testid={`checklist-step-${step.key}-verifying`}
                    >
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      <span>Verifying…</span>
                    </p>
                  ) : step.statusReason && (
                    <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${tone.text}`} role="status">
                      <tone.Icon className="size-3.5" aria-hidden />
                      <span>{step.statusReason}</span>
                    </p>
                  )}
                  {showRetry && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={step.onRetry}
                        data-testid={`checklist-step-${step.key}-retry`}
                        className="h-7 px-2 text-xs"
                      >
                        <RefreshCw className="mr-1 size-3.5" aria-hidden />
                        {step.retryLabel ?? "Retry"}
                      </Button>
                    </div>
                  )}
                  {!step.done && (
                    <p className={"mt-1 text-xs " + (isNext ? "text-foreground/80" : "text-muted-foreground")}>
                      {step.why}
                    </p>
                  )}
                  {!step.done && (
                    <details className="group mt-2 text-xs">
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-brand-glow hover:underline">
                        <HelpCircle className="size-3.5" aria-hidden />
                        Why this matters
                      </summary>
                      <dl className="mt-2 grid gap-1 text-muted-foreground">
                        <div><dt className="inline font-semibold text-foreground">Why: </dt><dd className="inline">{step.why}</dd></div>
                        <div><dt className="inline font-semibold text-foreground">Who: </dt><dd className="inline">{step.who}</dd></div>
                        <div><dt className="inline font-semibold text-foreground">What: </dt><dd className="inline">{step.what}</dd></div>
                        <div><dt className="inline font-semibold text-foreground">How: </dt><dd className="inline">{step.how}</dd></div>
                      </dl>
                    </details>
                  )}
                </div>
                {!step.done && !step.loading && (
                  <Link
                    to={step.to}
                    hash={step.toHash}
                    search={step.toSearch as any}
                    className="shrink-0"
                    data-testid={`checklist-step-${step.key}-start`}
                    aria-label={`${isNext ? "Start" : "Open"}: ${step.title}`}
                  >
                    <Button size="sm" variant={isNext ? "default" : "outline"} className="min-h-9">
                      {isNext ? "Start" : "Open"}
                      <ChevronRight className="ml-1 size-4" aria-hidden />
                    </Button>
                  </Link>
                )}
                {!step.done && step.loading && (
                  <div
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/40 px-2 py-1 text-[11px] text-muted-foreground"
                    aria-hidden
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    Checking
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
