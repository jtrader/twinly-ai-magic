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
import { generateRealMeProfile } from "@/lib/real-me-generate.functions";
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
import { ArrowLeft, CheckCircle2, Circle, History, Sparkles, Loader2 } from "lucide-react";

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
  const generateProfile = useServerFn(generateRealMeProfile);

  const [ready, setReady] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [activeSectionId, setActiveSectionId] = useState(REAL_ME_QUESTIONNAIRE[0].id);
  const [showHistory, setShowHistory] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

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
    setAnswers((a) => ({ ...a, [questionId]: value }));
    scheduleSave(questionId, value);
  }

  const overallPct = useMemo(() => computeOverallCompletionPercentage(REAL_ME_QUESTIONNAIRE, answers), [answers]);
  const activeSection = REAL_ME_QUESTIONNAIRE.find((s) => s.id === activeSectionId)!;
  const activeQuestions = useMemo(() => effectiveQuestions(activeSection, answers), [activeSection, answers]);

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!versionId) return null;

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Real Me baseline</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowHistory((s) => !s)}>
          <History className="mr-1.5 size-4" /> Version history
        </Button>
        <Button size="sm" onClick={() => setShowGenerate(true)}>
          <Sparkles className="mr-1.5 size-4" /> Generate random profile
        </Button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        The foundational profile every persona is built from. Answers autosave as you go — jump between sections in any order.
      </p>

      <div className="sticky top-0 z-10 mb-4 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold">Overall progress</span>
          <span className="tabular-nums text-muted-foreground">{overallPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${overallPct}%` }} />
        </div>
      </div>

      {showHistory ? (
        <VersionHistoryPanel />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <nav className="flex gap-1.5 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
            {REAL_ME_QUESTIONNAIRE.map((section) => {
              const status = computeSectionStatus(section, answers);
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
              <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={(v) => onAnswer(q.id, v)} />
            ))}
          </div>
        </div>
      )}

      <GenerateProfileDialog
        open={showGenerate}
        onOpenChange={setShowGenerate}
        onGenerate={async (seed) => {
          const result = await generateProfile({ data: seed });
          setVersionId(result.version.id);
          setAnswers((result.answers ?? {}) as Answers);
          toast.success("Generated a fresh AI profile draft — review and edit below.");
        }}
      />
    </AppShell>
  );
}

function QuestionField({ question, value, onChange }: { question: QuestionDefinition; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 text-sm font-medium">{question.promptText}{question.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}</div>
      {question.type === "multi_select" && (
        <MultiSelectInput options={question.options ?? []} value={(value as string[]) ?? []} onChange={onChange} />
      )}
      {question.type === "single_select" && (
        <SingleSelectInput options={question.options ?? []} value={(value as string) ?? ""} onChange={onChange} allowCustomOption={question.allowCustomOption} />
      )}
      {question.type === "yes_no" && (
        <YesNoInput value={value === undefined ? null : (value as boolean)} onChange={onChange} />
      )}
      {question.type === "rating" && (
        <RatingInput value={(value as number) ?? 5} onChange={onChange} />
      )}
      {question.type === "custom_prompt" && (
        <CustomPromptInput value={(value as string) ?? ""} onChange={onChange} maxLength={question.maxLength} />
      )}
    </div>
  );
}

function VersionHistoryPanel() {
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
            <Badge variant="outline" className="text-[10px] uppercase">{v.completion_percentage}% complete</Badge>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
