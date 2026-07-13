import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import {
  getRealMeProfile,
  listRealMeVersionHistory,
  saveRealMeAnswer,
} from "@/lib/real-me.functions";
import {
  generateRealMeVariants,
  saveGeneratedRealMe,
} from "@/lib/real-me-generate.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  REAL_ME_QUESTIONNAIRE,
  computeOverallCompletionPercentage,
  computeSectionStatus,
  effectiveQuestions,
  type Answers,
  type QuestionDefinition,
  type SectionStatus,
} from "@/lib/real-me-questionnaire-schema";
import {
  CustomPromptInput,
  MultiSelectInput,
  RatingInput,
  SingleSelectInput,
  YesNoInput,
} from "@/components/twinly/RealMeInputs";
import { ArrowLeft, CheckCircle2, Circle, History, Sparkles, Loader2, RefreshCw, X, Save, Lock, Unlock } from "lucide-react";
import { Download, RotateCcw, FileJson, FileText, Rows, LayoutGrid } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportRealMeJson, exportRealMePdf } from "@/lib/real-me-export";
import type { SeedInput } from "@/lib/real-me-generate.functions";

export const Route = createFileRoute("/studio/real-me")({
  component: RealMePage,
  head: () => ({
    meta: [
      { title: "Real Me baseline — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const STATUS_ICON: Record<SectionStatus, any> = { not_started: Circle, in_progress: Circle, complete: CheckCircle2 };
const STATUS_TONE: Record<SectionStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-amber-400",
  complete: "text-emerald-400",
};

function RealMePage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const getProfile = useServerFn(getRealMeProfile);
  const saveAnswer = useServerFn(saveRealMeAnswer);
  const generateVariants = useServerFn(generateRealMeVariants);
  const saveGenerated = useServerFn(saveGeneratedRealMe);

  const [ready, setReady] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [activeSectionId, setActiveSectionId] = useState(REAL_ME_QUESTIONNAIRE[0].id);
  const [showHistory, setShowHistory] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  // Auto-kick generation the next time the dialog opens (used by Regenerate).
  const [autoRunGenerate, setAutoRunGenerate] = useState(false);
  // Snapshot of the picked/edited answers before a Regenerate, so we can diff
  // the new variants against what the creator had.
  const [previousPickAnswers, setPreviousPickAnswers] = useState<Record<string, unknown> | null>(null);
  // When set, we're reviewing an unsaved draft (from AI generation OR from
  // restoring an older version). Autosave is suppressed and Save/Discard
  // controls take over.
  const [draft, setDraft] = useState<{
    answers: Answers;
    seed: SeedInput | null;
    restoredFrom?: { id: string; versionNumber: number };
  } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Per-question locks — locked ids are preserved by the AI on generate and
  // become read-only in the editor until unlocked.
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  // Load persisted locks per user.
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`real-me:locks:${user.id}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setLockedIds(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch {}
  }, [user]);

  const persistLocks = useCallback((next: Set<string>) => {
    if (!user) return;
    try {
      localStorage.setItem(`real-me:locks:${user.id}`, JSON.stringify([...next]));
    } catch {}
  }, [user]);

  const toggleLock = useCallback((questionId: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      persistLocks(next);
      return next;
    });
  }, [persistLocks]);

  const clearAllLocks = useCallback(() => {
    setLockedIds(() => {
      persistLocks(new Set());
      return new Set();
    });
  }, [persistLocks]);

  useEffect(() => {
    if (!user) return;
    getProfile({})
      .then((r) => {
        setVersionId(r.version.id);
        setAnswers((r.version.responses as Answers) ?? {});
      })
      .catch((e: any) => toast.error(e?.message ?? "Failed to load Real Me profile"))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
  }, []);

  const scheduleSave = useCallback((questionId: string, value: unknown) => {
    const timers = timersRef.current;
    const existing = timers.get(questionId);
    if (existing) clearTimeout(existing);
    timers.set(questionId, setTimeout(async () => {
      try {
        await saveAnswer({ data: { questionId, value } });
      } catch (e: any) {
        toast.error(e?.message ?? "Autosave failed");
      }
    }, 500));
  }, [saveAnswer]);

  function onAnswer(questionId: string, value: unknown) {
    if (lockedIds.has(questionId)) {
      toast.message("This answer is locked. Unlock it to edit.");
      return;
    }
    if (draft) {
      setDraft((d) => (d ? { ...d, answers: { ...d.answers, [questionId]: value } } : d));
      return;
    }
    setAnswers((a) => ({ ...a, [questionId]: value }));
    scheduleSave(questionId, value);
  }

  const displayedAnswers = draft?.answers ?? answers;
  const overallPct = useMemo(() => computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, displayedAnswers), [displayedAnswers]);
  const activeSection = REAL_ME_QUESTIONNAIRE.find((s) => s.id === activeSectionId)!;
  const activeQuestions = useMemo(() => effectiveQuestions(activeSection, displayedAnswers), [activeSection, displayedAnswers]);

  async function commitDraft() {
    if (!draft) return;
    setSavingDraft(true);
    try {
      const result = await saveGenerated({
        data: {
          answers: draft.answers as any,
          seed: draft.seed,
          restoredFromVersionId: draft.restoredFrom?.id ?? null,
        },
      });
      setVersionId(result.version.id);
      setAnswers((result.answers ?? {}) as Answers);
      setDraft(null);
      toast.success(`Saved as Version ${result.version.version_number}.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save version. Try again.");
    } finally {
      setSavingDraft(false);
    }
  }

  function discardDraft() {
    setDraft(null);
    setConfirmDiscard(false);
    toast.message("Discarded AI draft — original answers restored.");
  }

  function handleExportDraft(kind: "json" | "pdf") {
    if (!draft) return;
    const label = draft.restoredFrom
      ? `Restored draft (v${draft.restoredFrom.versionNumber})`
      : "AI-generated draft";
    const payload = {
      label,
      answers: draft.answers,
      seed: draft.seed ?? (draft.restoredFrom ? { restoredFromVersionId: draft.restoredFrom.id } : null),
    };
    try {
      if (kind === "json") exportRealMeJson(payload);
      else exportRealMePdf(payload);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed.");
    }
  }

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!versionId) {
    return (
      <AppShell>
        <div className="py-16 text-center text-sm text-muted-foreground">
          Couldn't load your Real Me baseline. <button className="underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Real Me baseline</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {lockedIds.size > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-400/50 text-amber-400">
              <Lock className="size-3" /> {lockedIds.size} locked
              <button
                type="button"
                onClick={clearAllLocks}
                className="ml-1 underline hover:text-amber-300"
              >
                clear
              </button>
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowHistory((s) => !s)} disabled={!!draft}>
            <History className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Version history</span>
            <span className="sm:hidden">History</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowGenerate(true)}
            disabled={!!draft}
            className="relative bg-gradient-to-r from-brand to-fuchsia-500 text-white shadow-md hover:opacity-90"
          >
            <Sparkles className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Generate random profile</span>
            <span className="sm:hidden">Generate</span>
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">AI</span>
          </Button>
        </div>
      </div>
      {draft ? (
        <DraftReviewBanner
          seed={draft.seed}
          restoredFrom={draft.restoredFrom}
          saving={savingDraft}
          onSave={commitDraft}
          onDiscard={() => setConfirmDiscard(true)}
          onRegenerate={draft.seed ? () => {
            // Snapshot the current draft answers so the compare view can show
            // the "Previous pick" column alongside the new variants.
            setPreviousPickAnswers({ ...draft.answers });
            setAutoRunGenerate(true);
            setShowGenerate(true);
          } : undefined}
          lockCount={lockedIds.size}
          onExport={handleExportDraft}
        />
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          The foundational profile every persona is built from. Answers autosave as you go — jump between sections in any order.
        </p>
      )}

      <div className="sticky top-0 z-10 mb-4 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold">{draft ? "Draft completeness" : "Overall progress"}</span>
          <span className="tabular-nums text-muted-foreground">{overallPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {showHistory ? (
        <VersionHistoryPanel
          disabled={!!draft}
          onRestore={(v) => {
            setDraft({
              answers: (v.responses ?? {}) as Answers,
              seed: null,
              restoredFrom: { id: v.id, versionNumber: v.version_number },
            });
            setShowHistory(false);
            setActiveSectionId(REAL_ME_QUESTIONNAIRE[0].id);
            toast.success(`Loaded Version ${v.version_number} as an editable draft.`);
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <nav className="flex gap-1.5 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
            {REAL_ME_QUESTIONNAIRE.map((section) => {
              const status = computeSectionStatus(section, displayedAnswers);
              const Icon = STATUS_ICON[status];
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={"flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition md:shrink " + (
                    activeSectionId === section.id ? "border-brand/50 bg-surface-elevated" : "border-border bg-surface hover:border-brand/30"
                  )}
                >
                  <Icon className={"size-3.5 shrink-0 " + STATUS_TONE[status]} />
                  <span className="whitespace-nowrap md:whitespace-normal">{section.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{activeSection.title}</div>
            {activeQuestions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={displayedAnswers[q.id]}
                onChange={(v) => onAnswer(q.id, v)}
                locked={lockedIds.has(q.id)}
                onToggleLock={() => toggleLock(q.id)}
              />
            ))}
          </div>
        </div>
      )}

      <GenerateProfileDialog
        open={showGenerate}
        onOpenChange={setShowGenerate}
        initialSeed={draft?.seed ?? null}
        autoRun={autoRunGenerate}
        lockedIds={[...lockedIds]}
        lockedAnswers={Object.fromEntries(
          [...lockedIds]
            .filter((id) => displayedAnswers[id] !== undefined)
            .map((id) => [id, displayedAnswers[id] as any]),
        )}
        previousAnswers={previousPickAnswers}
        generate={(input) => generateVariants(input) as unknown as Promise<{ variants: Variant[] }>}
        onPick={(seed, answers) => {
          // Preserve any locked answers on top of the AI output as a final safety net.
          const merged: Answers = { ...(answers as Answers) };
          for (const id of lockedIds) {
            if (displayedAnswers[id] !== undefined) merged[id] = displayedAnswers[id] as any;
          }
          setDraft({ seed, answers: merged });
          setPreviousPickAnswers(null);
          setAutoRunGenerate(false);
          setShowGenerate(false);
          setShowHistory(false);
          setActiveSectionId(REAL_ME_QUESTIONNAIRE[0].id);
          toast.success("Draft loaded — review, edit, then Save as a new version.");
        }}
      />

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this {draft?.restoredFrom ? "restored" : "AI-generated"} draft will be
              lost. This can't be undone. Your last saved version is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={discardDraft}>Discard draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  locked,
  onToggleLock,
}: {
  question: QuestionDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  locked: boolean;
  onToggleLock: () => void;
}) {
  const handleChange = (v: unknown) => {
    if (locked) return;
    onChange(v);
  };
  return (
    <div className={"rounded-2xl border p-4 transition " + (locked ? "border-amber-400/40 bg-amber-500/5" : "border-border bg-surface")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm font-medium">
          {question.promptText}
          {question.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}
          {locked && <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-amber-400">Locked</span>}
        </div>
        <button
          type="button"
          onClick={onToggleLock}
          className={"shrink-0 rounded-md p-1 transition " + (locked ? "text-amber-400 hover:bg-amber-500/10" : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground")}
          title={locked ? "Unlock — AI can update this answer" : "Lock — AI will preserve this answer"}
          aria-label={locked ? "Unlock answer" : "Lock answer"}
        >
          {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </button>
      </div>
      <div className={locked ? "pointer-events-none opacity-70" : ""} aria-disabled={locked}>
        {question.type === "multi_select" && (
          <MultiSelectInput options={question.options ?? []} value={(value as string[]) ?? []} onChange={handleChange} />
        )}
        {question.type === "single_select" && (
          <SingleSelectInput options={question.options ?? []} value={(value as string) ?? ""} onChange={handleChange} allowCustomOption={question.allowCustomOption} />
        )}
        {question.type === "yes_no" && (
          <YesNoInput value={value === undefined ? null : (value as boolean)} onChange={handleChange} />
        )}
        {question.type === "rating" && (
          <RatingInput value={(value as number) ?? 5} onChange={handleChange} />
        )}
        {question.type === "custom_prompt" && (
          <CustomPromptInput value={(value as string) ?? ""} onChange={handleChange} maxLength={question.maxLength} />
        )}
      </div>
    </div>
  );
}

function VersionHistoryPanel({
  disabled,
  onRestore,
}: {
  disabled?: boolean;
  onRestore: (v: any) => void;
}) {
  const list = useServerFn(listRealMeVersionHistory);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    list({}).then((r) => setVersions(r.versions)).catch(() => {}).finally(() => setLoadingList(false));
  }, [list]);

  if (loadingList) return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (versions.length === 0) return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No versions yet.</div>;

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Version {v.version_number}</span>
            <div className="flex items-center gap-2">
              {v.generation_seed ? (
                <Badge className="bg-brand/15 text-brand text-[10px] uppercase" variant="secondary">
                  <Sparkles className="mr-1 size-3" /> AI generated
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[10px] uppercase">{v.completion_percentage}% complete</Badge>
            </div>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
          {v.generation_seed ? (
            <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-surface-elevated/40 p-2 text-[11px] text-muted-foreground">
              <div><span className="font-medium text-foreground">Gender:</span> {v.generation_seed.gender ?? "—"}</div>
              <div><span className="font-medium text-foreground">Age bracket:</span> {v.generation_seed.ageBracket ?? "—"}</div>
              <div><span className="font-medium text-foreground">Lifestyle:</span> {(v.generation_seed.lifestyle ?? []).join(", ") || "—"}</div>
              <div><span className="font-medium text-foreground">Traits:</span> {(v.generation_seed.traits ?? []).join(", ") || "—"}</div>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Download className="mr-1.5 size-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    exportRealMeJson({
                      label: `Real Me v${v.version_number}`,
                      answers: (v.responses ?? {}) as Answers,
                      seed: v.generation_seed ?? null,
                      completion: v.completion_percentage,
                      versionNumber: v.version_number,
                      createdAt: v.created_at,
                    })
                  }
                >
                  <FileJson className="mr-2 size-4" /> Download JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    try {
                      exportRealMePdf({
                        label: `Real Me v${v.version_number}`,
                        answers: (v.responses ?? {}) as Answers,
                        seed: v.generation_seed ?? null,
                        completion: v.completion_percentage,
                        versionNumber: v.version_number,
                        createdAt: v.created_at,
                      });
                    } catch (e: any) {
                      toast.error(e?.message ?? "Export failed.");
                    }
                  }}
                >
                  <FileText className="mr-2 size-4" /> Print / Save as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => onRestore(v)} disabled={disabled}>
              <RotateCcw className="mr-1.5 size-4" /> Restore as draft
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const AGE_OPTIONS = ["18-24", "25-34", "35-44", "45-54", "55+"];
const LIFESTYLE_OPTIONS = [
  "Urban", "Suburban", "Rural", "Fitness-focused", "Homebody", "Travels often",
  "Nightlife", "Outdoorsy", "Creative/artsy", "Tech/startup", "Parenting",
  "Student life", "Foodie", "Wellness-focused",
];
const TRAIT_OPTIONS = [
  "Warm", "Dry-witted", "Adventurous", "Calm", "Intense", "Playful", "Thoughtful",
  "Blunt", "Romantic", "Guarded", "Confident", "Curious", "Empathetic", "Sarcastic",
  "Ambitious", "Nurturing", "Rebellious", "Optimistic",
];

type Variant = { id: string; style: string; answers: Record<string, unknown>; completion: number };

function DraftReviewBanner({
  seed,
  restoredFrom,
  saving,
  onSave,
  onDiscard,
  onRegenerate,
  lockCount,
  onExport,
}: {
  seed: SeedInput | null;
  restoredFrom?: { id: string; versionNumber: number };
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRegenerate?: () => void;
  lockCount?: number;
  onExport: (kind: "json" | "pdf") => void;
}) {
  const isRestore = !!restoredFrom;
  return (
    <div className="mb-4 rounded-xl border border-brand/40 bg-brand/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand">
            {isRestore ? <RotateCcw className="size-4" /> : <Sparkles className="size-4" />}
            {isRestore
              ? `Reviewing restored draft (from Version ${restoredFrom!.versionNumber})`
              : "Reviewing AI-generated draft"}
          </div>
          <p className="text-xs text-muted-foreground">
            Edit anything below, then Save to create a new version. Nothing is stored until you save.
          </p>
          {lockCount && lockCount > 0 ? (
            <p className="mt-1 text-[11px] text-amber-400">
              <Lock className="mr-1 inline size-3" /> {lockCount} locked answer{lockCount === 1 ? "" : "s"} — Regenerate will keep these fixed.
            </p>
          ) : null}
          {seed ? (
            <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
              <Badge variant="outline">{seed.gender}</Badge>
              <Badge variant="outline">{seed.ageBracket}</Badge>
              {seed.lifestyle.map((l) => <Badge key={"l-" + l} variant="outline">{l}</Badge>)}
              {seed.traits.map((t) => <Badge key={"t-" + t} variant="outline">{t}</Badge>)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={saving}>
                <Download className="mr-1.5 size-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport("json")}>
                <FileJson className="mr-2 size-4" /> Download JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("pdf")}>
                <FileText className="mr-2 size-4" /> Print / Save as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={saving}>
            <X className="mr-1.5 size-4" /> Discard
          </Button>
          {onRegenerate ? (
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={saving}>
              <RefreshCw className="mr-1.5 size-4" /> Regenerate
            </Button>
          ) : null}
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Saving…</> : <><Save className="mr-1.5 size-4" /> Save as new version</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GenerateProfileDialog({
  open,
  onOpenChange,
  initialSeed,
  autoRun,
  lockedIds,
  lockedAnswers,
  previousAnswers,
  generate,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialSeed: SeedInput | null;
  autoRun?: boolean;
  lockedIds?: string[];
  lockedAnswers?: Record<string, unknown>;
  previousAnswers?: Record<string, unknown> | null;
  generate: (input: { data: { seed: SeedInput; count: number; lockedAnswers?: Record<string, unknown> } }) => Promise<{ variants: Variant[] }>;
  onPick: (seed: SeedInput, answers: Record<string, unknown>) => void;
}) {
  const [step, setStep] = useState<"seeds" | "loading" | "pick" | "error">("seeds");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [traits, setTraits] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [attempt, setAttempt] = useState(0);
  const [pickView, setPickView] = useState<"cards" | "compare">("cards");
  const lockedAnswersRef = useRef<Record<string, unknown>>({});
  useEffect(() => { lockedAnswersRef.current = lockedAnswers ?? {}; }, [lockedAnswers]);

  // Rehydrate previous seeds when dialog re-opens (e.g. Regenerate from draft banner)
  useEffect(() => {
    if (!open) return;
    if (initialSeed) {
      setGender(initialSeed.gender);
      setAge(initialSeed.ageBracket);
      setLifestyle(initialSeed.lifestyle);
      setTraits(initialSeed.traits);
    }
    setVariants([]);
    setErrorMsg("");
    setPickView(previousAnswers ? "compare" : "cards");
    if (autoRun && initialSeed) {
      setStep("loading");
      // Kick off generation once state is set.
      void runGenerateWith(initialSeed);
    } else {
      setStep("seeds");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSeed]);

  function toggle(list: string[], value: string, setter: (v: string[]) => void, limit: number) {
    if (list.includes(value)) setter(list.filter((v) => v !== value));
    else if (list.length < limit) setter([...list, value]);
  }

  const busy = step === "loading";
  const canGenerate = !!gender && !!age && lifestyle.length > 0 && traits.length > 0 && !busy;

  async function runGenerateWith(seed: SeedInput) {
    setStep("loading");
    setErrorMsg("");
    setAttempt((a) => a + 1);
    try {
      const res = await generate({ data: { seed, count: 3, lockedAnswers: lockedAnswersRef.current as any } });
      if (!res.variants.length) {
        setStep("error");
        setErrorMsg("AI returned no usable variants. Try again.");
        return;
      }
      setVariants(res.variants);
      setStep("pick");
    } catch (e: any) {
      setStep("error");
      setErrorMsg(e?.message ?? "Something went wrong. Try again.");
    }
  }

  async function runGenerate() {
    if (!canGenerate) return;
    await runGenerateWith({ gender, ageBracket: age, lifestyle, traits });
  }

  function pickVariant(v: Variant) {
    onPick({ gender, ageBracket: age, lifestyle, traits }, v.answers);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" /> Generate random AI profile
            {lockedIds && lockedIds.length > 0 && (
              <Badge variant="outline" className="ml-1 gap-1 border-amber-400/50 text-amber-400">
                <Lock className="size-3" /> {lockedIds.length} locked
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? "Pick your favorite variant. You'll be able to edit every field before saving."
              : lockedIds && lockedIds.length > 0
                ? "Locked answers stay fixed. AI drafts 3 alternate profiles for the rest."
                : "Answer a few quick seeds — AI drafts 3 alternate profiles so you can pick the best one."}
          </DialogDescription>
        </DialogHeader>

        {(step === "seeds" || step === "error") && (
          <div className="space-y-5 py-2">
            <div className="grid gap-2">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Age bracket</Label>
              <Select value={age} onValueChange={setAge}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Lifestyle <span className="text-xs text-muted-foreground">(pick up to 4)</span></Label>
              <div className="flex flex-wrap gap-2">
                {LIFESTYLE_OPTIONS.map((opt) => {
                  const active = lifestyle.includes(opt);
                  return (
                    <button key={opt} type="button" onClick={() => toggle(lifestyle, opt, setLifestyle, 4)}
                      className={"rounded-full border px-3 py-1 text-xs transition " + (active
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border bg-surface hover:border-brand/40")}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Character traits <span className="text-xs text-muted-foreground">(pick up to 5)</span></Label>
              <div className="flex flex-wrap gap-2">
                {TRAIT_OPTIONS.map((opt) => {
                  const active = traits.includes(opt);
                  return (
                    <button key={opt} type="button" onClick={() => toggle(traits, opt, setTraits, 5)}
                      className={"rounded-full border px-3 py-1 text-xs transition " + (active
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border bg-surface hover:border-brand/40")}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {step === "error" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="font-semibold">Generation failed</div>
                <div className="mt-0.5 text-destructive/90">{errorMsg}</div>
              </div>
            )}
          </div>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-brand" />
            <div>Drafting 3 alternate profiles… this usually takes 10–20 seconds.</div>
            {attempt > 1 && <div className="text-xs">Retry attempt {attempt}</div>}
          </div>
        )}

        {step === "pick" && (
          <div className="py-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {variants.length} variant{variants.length === 1 ? "" : "s"} · pick one to edit
              </div>
              <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPickView("cards")}
                  className={"flex items-center gap-1 rounded-md px-2 py-1 " + (pickView === "cards" ? "bg-surface-elevated text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <LayoutGrid className="size-3.5" /> Cards
                </button>
                <button
                  type="button"
                  onClick={() => setPickView("compare")}
                  className={"flex items-center gap-1 rounded-md px-2 py-1 " + (pickView === "compare" ? "bg-surface-elevated text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <Rows className="size-3.5" /> Compare
                </button>
              </div>
            </div>
            {pickView === "cards" ? (
              <div className="grid gap-3 md:grid-cols-3">
                {variants.map((v, i) => (
                  <VariantCard key={v.id} index={i + 1} variant={v} onPick={() => pickVariant(v)} />
                ))}
              </div>
            ) : (
              <VariantCompareTable variants={variants} previousAnswers={previousAnswers ?? null} onPick={pickVariant} />
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "pick" ? (
            <>
              <Button variant="ghost" onClick={() => setStep("seeds")}>
                Change seeds
              </Button>
              <Button variant="outline" onClick={runGenerate}>
                <RefreshCw className="mr-1.5 size-4" /> Regenerate all
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={runGenerate} disabled={!canGenerate}>
                {busy ? (
                  <><Loader2 className="mr-1.5 size-4 animate-spin" /> Generating…</>
                ) : step === "error" ? (
                  <><RefreshCw className="mr-1.5 size-4" /> Try again</>
                ) : (
                  <><Sparkles className="mr-1.5 size-4" /> Generate 3 variants</>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantCard({ index, variant, onPick }: { index: number; variant: Variant; onPick: () => void }) {
  const name = (variant.answers["1.1"] as string) || `Variant ${index}`;
  const pronouns = (variant.answers["1.2"] as string) || "";
  const region = (variant.answers["1.3"] as string) || "";
  const outlook = (variant.answers["4.1"] as string) || "";
  const traits = (variant.answers["2.1"] as string[]) || [];
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex flex-col rounded-xl border border-border bg-surface p-3 text-left transition hover:border-brand/50 hover:bg-surface-elevated"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Variant {index}</span>
        <Badge variant="outline" className="text-[10px]">{variant.completion}%</Badge>
      </div>
      <div className="font-display text-lg font-bold">{name}</div>
      {pronouns && <div className="text-xs text-muted-foreground">{pronouns}{region ? ` · ${region}` : ""}</div>}
      {outlook && <div className="mt-2 text-xs"><span className="font-medium">Outlook:</span> {outlook}</div>}
      {traits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {traits.slice(0, 4).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
        </div>
      )}
      <div className="mt-3 text-[11px] font-semibold text-brand">Pick and edit →</div>
    </button>
  );
}

/** Key questions surfaced in the side-by-side comparison view. */
const COMPARE_QUESTION_IDS: string[] = [
  "1.1", // Name
  "1.2", // Pronouns
  "1.3", // Region
  "2.1", // Character traits
  "2.2", // Warmth/spark
  "3.1", // Interests
  "4.1", // Outlook
  "5.1", // Communication style
  "6.1", // Humor
];

function VariantCompareTable({ variants, previousAnswers, onPick }: { variants: Variant[]; previousAnswers?: Record<string, unknown> | null; onPick: (v: Variant) => void }) {
  const byId = new Map<string, QuestionDefinition>();
  for (const s of REAL_ME_QUESTIONNAIRE) for (const q of s.questions) byId.set(q.id, q);
  const rows = COMPARE_QUESTION_IDS.map((id) => byId.get(id)).filter((q): q is QuestionDefinition => !!q);

  function fmt(v: unknown) {
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground/60">—</span>;
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return String(v);
  }

  function same(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
    return a === b;
  }

  const showPrev = !!previousAnswers && Object.keys(previousAnswers).length > 0;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-elevated/60 px-3 py-2 text-left font-semibold">Field</th>
            {showPrev && (
              <th className="border-l border-border px-3 py-2 text-left font-semibold text-muted-foreground/80">
                Previous pick
              </th>
            )}
            {variants.map((v, i) => (
              <th key={v.id} className="border-l border-border px-3 py-2 text-left font-semibold">
                <div className="flex items-center justify-between gap-2">
                  <span>Variant {i + 1}</span>
                  <Badge variant="outline" className="text-[10px]">{v.completion}%</Badge>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-t border-border align-top">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-muted-foreground">{q.promptText}</td>
              {showPrev && (
                <td className="border-l border-border px-3 py-2 text-muted-foreground/80">
                  {fmt(previousAnswers![q.id])}
                </td>
              )}
              {variants.map((v) => (
                <td
                  key={v.id + q.id}
                  className={
                    "border-l border-border px-3 py-2 " +
                    (showPrev && !same(v.answers[q.id], previousAnswers![q.id]) ? "bg-brand/5 text-foreground" : "")
                  }
                >
                  {fmt(v.answers[q.id])}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border bg-surface-elevated/40">
            <td className="sticky left-0 z-10 bg-surface-elevated/40 px-3 py-2" />
            {showPrev && <td className="border-l border-border px-3 py-2" />}
            {variants.map((v) => (
              <td key={"pick-" + v.id} className="border-l border-border px-3 py-2">
                <Button size="sm" className="w-full" onClick={() => onPick(v)}>
                  Pick this variant
                </Button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
