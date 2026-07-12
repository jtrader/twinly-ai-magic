import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import {
  createPoll,
  getPollResults,
  listCreatorPolls,
  setPollStatus,
  updatePoll,
} from "@/lib/polls.functions";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/studio/polls")({
  component: PollsPage,
  head: () => ({
    meta: [
      { title: "Polls — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Tier = "public" | "logged_in" | "subscribers_only";
const TIER_LABEL: Record<Tier, string> = { public: "Public visitors", logged_in: "Logged-in (non-paying)", subscribers_only: "Paying subscribers" };
const TYPE_LABEL: Record<string, string> = { single_choice: "Single choice", multi_choice: "Multi choice", tip_to_vote: "Tip to vote" };
const STATUS_TONE: Record<string, string> = {
  draft: "border-border bg-surface text-muted-foreground",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  closed: "border-brand/40 bg-brand/10 text-brand-glow",
};

type PollRow = Awaited<ReturnType<typeof listCreatorPolls>>["polls"][number];

function emptyOptions() {
  return [{ label: "", linkedTipAmountUsd: undefined as number | undefined }, { label: "", linkedTipAmountUsd: undefined as number | undefined }];
}

function PollsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const list = useServerFn(listCreatorPolls);
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const r = await list({});
      setPolls(r.polls as PollRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load polls");
    } finally {
      setReady(true);
    }
  }, [list]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const selected = polls.find((p: any) => p.id === selectedId) ?? null;
  const grouped = useMemo(() => ({
    draft: polls.filter((p: any) => p.status === "draft"),
    active: polls.filter((p: any) => p.status === "active"),
    closed: polls.filter((p: any) => p.status === "closed"),
  }), [polls]);

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Polls</h1>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setSelectedId(null); }}>
          <Plus className="mr-1.5 size-4" /> New poll
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          {(["draft", "active", "closed"] as const).map((status) => (
            <div key={status}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {status} ({grouped[status].length})
              </div>
              <div className="space-y-1.5">
                {grouped[status].map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setCreating(false); }}
                    className={"block w-full rounded-xl border p-2.5 text-left text-sm transition " + (
                      selectedId === p.id ? "border-brand/50 bg-surface-elevated" : "border-border bg-surface hover:border-brand/30"
                    )}
                  >
                    <div className="truncate font-medium">{p.question}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase">{TYPE_LABEL[p.poll_type]}</Badge>
                    </div>
                  </button>
                ))}
                {grouped[status].length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">None yet.</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div>
          {creating ? (
            <PollForm mode="create" onDone={() => { setCreating(false); refresh(); }} onCancel={() => setCreating(false)} />
          ) : selected ? (
            <PollDetail key={selected.id} poll={selected} onChanged={refresh} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Select a poll, or create a new one.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PollForm({ mode, poll, onDone, onCancel }: { mode: "create" | "edit"; poll?: any; onDone: () => void; onCancel: () => void }) {
  const create = useServerFn(createPoll);
  const update = useServerFn(updatePoll);
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [pollType, setPollType] = useState<string>(poll?.poll_type ?? "single_choice");
  const [visibility, setVisibility] = useState<Tier>(poll?.visibility ?? "public");
  const [closesAt, setClosesAt] = useState(poll?.closes_at ? poll.closes_at.slice(0, 16) : "");
  const [anonymous, setAnonymous] = useState(poll?.anonymous ?? true);
  const [resultsAfterClose, setResultsAfterClose] = useState(poll?.results_visible_after_close ?? false);
  const [options, setOptions] = useState(
    poll?.poll_options?.length
      ? poll.poll_options
        .slice().sort((a: any, b: any) => a.display_order - b.display_order)
        .map((o: any) => ({ label: o.label, linkedTipAmountUsd: o.linked_tip_amount_usd ?? undefined }))
      : emptyOptions(),
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (question.trim().length === 0) { toast.error("Question is required"); return; }
    const cleanOptions = options.filter((o: any) => o.label.trim().length > 0);
    if (cleanOptions.length < 2) { toast.error("Add at least 2 options"); return; }
    if (pollType === "tip_to_vote" && cleanOptions.some((o: any) => !o.linkedTipAmountUsd || o.linkedTipAmountUsd < 1)) {
      toast.error("Every option needs a tip amount of at least $1");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await create({
          data: {
            question, pollType: pollType as any, visibility, anonymous,
            resultsVisibleAfterClose: resultsAfterClose,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            options: cleanOptions,
          },
        });
        toast.success("Poll created as a draft");
      } else {
        await update({
          data: {
            pollId: poll.id, question, visibility, anonymous,
            resultsVisibleAfterClose: resultsAfterClose,
            closesAt: closesAt ? new Date(closesAt).toISOString() : null,
            options: cleanOptions,
          },
        });
        toast.success("Poll updated");
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div>
        <Label className="mb-1 block text-xs">Question</Label>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should I post next?" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs">Poll type</Label>
          <Select value={pollType} onValueChange={setPollType} disabled={mode === "edit"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single_choice">Single choice</SelectItem>
              <SelectItem value="multi_choice">Multi choice</SelectItem>
              <SelectItem value="tip_to_vote">Tip to vote</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Visibility</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as Tier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TIER_LABEL) as Tier[]).map((t) => <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-xs">Closes at (optional)</Label>
        <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
      </div>

      <div>
        <Label className="mb-2 block text-xs">Options</Label>
        <div className="space-y-2">
          {options.map((o: any, i: number) => (
            <div key={i} className="flex gap-1.5">
              <Input
                value={o.label}
                onChange={(e) => setOptions((arr: any) => arr.map((x: any, j: number) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder={`Option ${i + 1}`}
              />
              {pollType === "tip_to_vote" && (
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  className="w-28"
                  value={o.linkedTipAmountUsd ?? ""}
                  onChange={(e) => setOptions((arr: any) => arr.map((x: any, j: number) => (j === i ? { ...x, linkedTipAmountUsd: parseFloat(e.target.value) || undefined } : x)))}
                  placeholder="$ amount"
                />
              )}
              {options.length > 2 && (
                <Button variant="ghost" size="sm" onClick={() => setOptions((arr: any) => arr.filter((_: any, j: number) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {options.length < 20 && (
            <Button variant="outline" size="sm" onClick={() => setOptions((arr: any) => [...arr, { label: "", linkedTipAmountUsd: undefined }])}>
              <Plus className="mr-1 size-3.5" /> Add option
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={anonymous} onCheckedChange={setAnonymous} />
          Aggregate-only results (hide voter identity)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={resultsAfterClose} onCheckedChange={setResultsAfterClose} />
          Hide results from voters until the poll closes
        </label>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Create draft" : "Save changes"}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

function PollDetail({ poll, onChanged }: { poll: any; onChanged: () => void }) {
  const setStatus = useServerFn(setPollStatus);
  const getResults = useServerFn(getPollResults);
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<Awaited<ReturnType<typeof getPollResults>> | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshResults = useCallback(async () => {
    try {
      const r = await getResults({ data: { pollId: poll.id } });
      setResults(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load results");
    }
  }, [getResults, poll.id]);

  useEffect(() => { refreshResults(); }, [refreshResults]);

  async function onActivate() {
    setBusy(true);
    try {
      await setStatus({ data: { pollId: poll.id, status: "active" } });
      toast.success("Poll is now active");
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  async function onClose() {
    setBusy(true);
    try {
      await setStatus({ data: { pollId: poll.id, status: "closed" } });
      toast.success("Poll closed");
      onChanged();
      refreshResults();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  if (editing) {
    return <PollForm mode="edit" poll={poll} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold">{poll.question}</h2>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant="outline" className={"text-[10px] uppercase tracking-widest " + STATUS_TONE[poll.status]}>{poll.status}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{TYPE_LABEL[poll.poll_type]}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">{TIER_LABEL[poll.visibility as Tier]}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {poll.status === "draft" && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          {poll.status === "draft" && <Button size="sm" onClick={onActivate} disabled={busy}>Activate</Button>}
          {poll.status === "active" && <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Close now</Button>}
        </div>
      </div>

      {results && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs text-muted-foreground">{results.totalVoters} voter{results.totalVoters === 1 ? "" : "s"} · {results.totalResponses} response{results.totalResponses === 1 ? "" : "s"}</div>
          {results.options.map((o: any) => (
            <div key={o.optionId}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{o.label}</span>
                <span className="text-muted-foreground">{o.count} ({o.percentage}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-brand" style={{ width: `${o.percentage}%` }} />
              </div>
              {!poll.anonymous && o.voters.length > 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">{o.voters.map((v: any) => v.name).join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
