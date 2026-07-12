import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmbeddedCheckoutDialog } from "@/components/twinly/EmbeddedCheckoutDialog";
import { AuthPromptDialog } from "@/components/twinly/AuthPromptDialog";
import { useSession } from "@/lib/session";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { submitPollVote } from "@/lib/polls.functions";
import { createPollVoteTipCheckout } from "@/lib/checkout.functions";
import { CheckCircle2 } from "lucide-react";

type PollOption = { id: string; label: string; linked_tip_amount_usd: number | null; count: number };
type Poll = {
  id: string;
  question: string;
  poll_type: "single_choice" | "multi_choice" | "tip_to_vote";
  status: "draft" | "active" | "closed";
  anonymous: boolean;
  results_visible_after_close: boolean;
  myVotes: string[];
  hasVoted: boolean;
  showResults: boolean;
  totalResponses: number;
  options: PollOption[];
};

export function PollCard({ poll, onVoted }: { poll: Poll; onVoted?: () => void }) {
  const { user } = useSession();
  const [selected, setSelected] = useState<Set<string>>(new Set(poll.myVotes));
  const [busy, setBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const vote = useServerFn(submitPollVote);
  const startTipVote = useServerFn(createPollVoteTipCheckout);

  const canVote = poll.status === "active" && !poll.hasVoted;
  const totalVotes = poll.options.reduce((sum, o) => sum + o.count, 0);

  async function submitSingle(optionId: string) {
    if (!canVote || busy) return;
    setBusy(true);
    try {
      await vote({ data: { pollId: poll.id, optionIds: [optionId] } });
      toast.success("Vote submitted");
      onVoted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to vote");
    } finally { setBusy(false); }
  }

  async function submitMulti() {
    if (!canVote || busy || selected.size === 0) return;
    setBusy(true);
    try {
      await vote({ data: { pollId: poll.id, optionIds: [...selected] } });
      toast.success("Vote submitted");
      onVoted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to vote");
    } finally { setBusy(false); }
  }

  async function startTipToVote(optionId: string) {
    if (!isPaymentsConfigured()) { toast.error("Payments not configured yet."); return; }
    setBusy(true);
    try {
      const res = await startTipVote({
        data: {
          pollId: poll.id, optionId,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      setClientSecret(res.clientSecret);
      setCheckoutOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
    } finally { setBusy(false); }
  }

  const showResultsNow = poll.showResults;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="font-semibold">{poll.question}</div>
        {poll.status === "closed" && <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Closed</span>}
      </div>

      {!user ? (
        <AuthPromptDialog title="Sign in to vote" description="Create a free account to participate in polls.">
          <Button size="sm" variant="outline">Sign in to vote</Button>
        </AuthPromptDialog>
      ) : canVote && poll.poll_type === "single_choice" ? (
        <div className="space-y-2">
          {poll.options.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => submitSingle(o.id)}
              className="block w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-left text-sm transition hover:border-brand/40"
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : canVote && poll.poll_type === "multi_choice" ? (
        <div className="space-y-2">
          {poll.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm">
              <Checkbox
                checked={selected.has(o.id)}
                onCheckedChange={() => setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                  return next;
                })}
              />
              {o.label}
            </label>
          ))}
          <Button size="sm" onClick={submitMulti} disabled={busy || selected.size === 0}>Submit votes</Button>
        </div>
      ) : canVote && poll.poll_type === "tip_to_vote" ? (
        <div className="space-y-2">
          {poll.options.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm">
              <span>{o.label}</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => startTipToVote(o.id)}>
                Tip ${Number(o.linked_tip_amount_usd ?? 0).toFixed(2)} to vote
              </Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Each vote here is a real tip to the creator — price shown before you tip, never after.</p>
        </div>
      ) : null}

      {(!canVote || poll.hasVoted) && (
        showResultsNow ? (
          <div className="space-y-2">
            {poll.hasVoted && (
              <div className="mb-1 flex items-center gap-1.5 text-xs text-emerald-300">
                <CheckCircle2 className="size-3.5" /> You voted
              </div>
            )}
            <div className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes === 1 ? "" : "s"}</div>
            {poll.options.map((o) => {
              const pct = totalVotes > 0 ? Math.round((o.count / totalVotes) * 1000) / 10 : 0;
              const mine = poll.myVotes.includes(o.id);
              return (
                <div key={o.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className={mine ? "font-semibold text-brand-glow" : ""}>{o.label}{mine ? " ✓" : ""}</span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                    <div className={"h-full rounded-full " + (mine ? "bg-brand-glow" : "bg-brand/60")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            {poll.hasVoted ? "You voted — results are revealed when this poll closes." : "This poll has closed."}
          </div>
        )
      )}

      {clientSecret && (
        <EmbeddedCheckoutDialog
          open={checkoutOpen}
          onOpenChange={(o) => { setCheckoutOpen(o); if (!o) onVoted?.(); }}
          clientSecret={clientSecret}
        />
      )}
    </div>
  );
}
