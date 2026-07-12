import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceSourceRecorder } from "@/components/twinly/VoiceSourceRecorder";
import { useSession } from "@/lib/session";
import {
  createTierPersona,
  exportPersonaOnboardingMarkdown,
  generatePersonaOnboardingCopy,
  getPersonaOnboardingConfig,
  listPersonaTierSuggestions,
  saveQuestionnaireResponse,
  setPersonaOnboardingStatus,
  updateContentFrameworkChoices,
  updatePersonaOnboardingCopy,
} from "@/lib/persona-onboarding.functions";
import {
  deleteVoiceSourceRecording,
  listVoiceSourceRecordings,
  submitVoiceCloneJob,
} from "@/lib/voice-sources.functions";
import { getPersonaRealMeSyncStatus, resyncPersonaToRealMe } from "@/lib/real-me.functions";
import type { QuestionnaireAnswers } from "@/lib/persona-onboarding-generation.server";
import { ArrowLeft, Download, Plus, RefreshCw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/studio/persona-onboarding")({
  component: PersonaOnboardingPage,
  head: () => ({
    meta: [
      { title: "Persona onboarding studio — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const TIER_TONE: Record<string, string> = {
  real_me: "border-real/30 bg-real/10 text-real",
  nice: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  naughty: "border-brand/40 bg-brand/10 text-brand-glow",
  wicked: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  custom: "border-border bg-surface text-muted-foreground",
};
const TIER_LABEL: Record<string, string> = { real_me: "Real Me", nice: "Nice", naughty: "Naughty", wicked: "Wicked", custom: "Custom" };

function emptyAnswers(): QuestionnaireAnswers {
  return {
    voicePersonality: { toneWords: [], pacing: "", humorStyle: "" },
    boundariesPreferences: { topicsToAvoid: [], topicsToLeanInto: [], phrasesWanted: [], phrasesAvoided: [] },
    audienceFraming: { selfDescription: "", relationshipToRealMe: "" },
    contentThemes: { subjectAreas: [] },
  };
}

function csv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function PersonaOnboardingPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const listScope = useServerFn(listPersonaTierSuggestions);
  const createTier = useServerFn(createTierPersona);
  const exportMd = useServerFn(exportPersonaOnboardingMarkdown);

  const [scope, setScope] = useState<Awaited<ReturnType<typeof listPersonaTierSuggestions>> | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    try {
      const r = await listScope({});
      setScope(r);
      setSelectedId((prev) => prev ?? r.personas[0]?.id ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setReady(true);
    }
  }, [listScope]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function onEnableTier(tier: "nice" | "naughty" | "wicked") {
    try {
      const r = await createTier({ data: { tier } });
      toast.success(`${TIER_LABEL[tier]} persona created`);
      await refresh();
      setSelectedId(r.persona.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create persona");
    }
  }

  async function onAddCustom() {
    const name = customName.trim();
    if (!name) return;
    try {
      const r = await createTier({ data: { tier: "custom", customName: name } });
      toast.success("Custom persona created");
      setCustomName("");
      await refresh();
      setSelectedId(r.persona.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create persona");
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      const { markdown, filename } = await exportMd({});
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported");
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading || !ready) {
    return <AppShell><div className="py-16 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!scope) return null;

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <Link to="/studio" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="font-display text-2xl font-bold">Persona onboarding</h1>
        </div>
        <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
          <Download className="mr-1.5 size-4" /> {exporting ? "Exporting…" : "Export all (Markdown)"}
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Answer a short brand-safe questionnaire per persona to generate tone guidelines and opener templates — always suggestive-at-most, never explicit, regardless of tier name.
      </p>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="space-y-1.5">
            {scope.personas.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={"flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm transition " + (
                  selectedId === p.id ? "border-brand/50 bg-surface-elevated" : "border-border bg-surface hover:border-brand/30"
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.display_name}</span>
                <Badge variant="outline" className={"shrink-0 text-[9px] uppercase tracking-widest " + (TIER_TONE[p.persona_type] ?? TIER_TONE.custom)}>
                  {TIER_LABEL[p.persona_type] ?? p.persona_type}
                </Badge>
              </button>
            ))}
          </div>

          {scope.suggestions.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Suggested tiers</div>
              <div className="space-y-1.5">
                {scope.suggestions.map((s: any) => (
                  <button
                    key={s.tier}
                    onClick={() => onEnableTier(s.tier)}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-left text-sm text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
                  >
                    <Plus className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.name}</span>
                      <span className="block truncate text-xs">{s.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Add custom persona</div>
            <div className="flex gap-1.5">
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Persona name" className="h-9 text-sm" />
              <Button size="sm" onClick={onAddCustom} disabled={!customName.trim()}>Add</Button>
            </div>
          </div>
        </aside>

        <div>
          {selectedId ? (
            <PersonaOnboardingDetail key={selectedId} personaId={selectedId} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Select or add a persona to get started.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PersonaOnboardingDetail({ personaId }: { personaId: string }) {
  const getConfig = useServerFn(getPersonaOnboardingConfig);
  const saveResponse = useServerFn(saveQuestionnaireResponse);
  const generate = useServerFn(generatePersonaOnboardingCopy);
  const updateCopy = useServerFn(updatePersonaOnboardingCopy);
  const updateChoices = useServerFn(updateContentFrameworkChoices);
  const setStatus = useServerFn(setPersonaOnboardingStatus);

  const [tab, setTab] = useState<"questionnaire" | "copy" | "preview" | "voice">("questionnaire");
  const [data, setData] = useState<Awaited<ReturnType<typeof getPersonaOnboardingConfig>> | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(emptyAnswers());
  const [toneGuidelines, setToneGuidelines] = useState("");
  const [openers, setOpeners] = useState<string[]>([]);
  const [cadence, setCadence] = useState("");
  const [favoriteThemes, setFavoriteThemes] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await getConfig({ data: { personaId } });
      setData(r);
      if (r.latestResponse?.answers) setAnswers(r.latestResponse.answers as QuestionnaireAnswers);
      setToneGuidelines(r.config?.tone_guidelines ?? "");
      setOpeners((r.config?.opener_templates as string[]) ?? []);
      const choices = (r.config?.content_framework_choices ?? {}) as any;
      setCadence(choices.cadence ?? "");
      setFavoriteThemes((choices.favoriteThemes ?? []).join(", "));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load persona");
    }
  }, [getConfig, personaId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onSaveQuestionnaire() {
    setBusy(true);
    try {
      await saveResponse({ data: { personaId, answers } });
      await updateChoices({ data: { personaId, choices: { cadence, favoriteThemes: csv(favoriteThemes) } } });
      toast.success("Questionnaire saved");
      await refresh();
      setTab("copy");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally { setBusy(false); }
  }

  async function onGenerate() {
    setBusy(true);
    try {
      const r = await generate({ data: { personaId } });
      setToneGuidelines(r.toneGuidelines);
      setOpeners(r.openerTemplates);
      toast.success("Generated a new draft");
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally { setBusy(false); }
  }

  async function onSaveCopy() {
    setBusy(true);
    try {
      await updateCopy({ data: { personaId, toneGuidelines, openerTemplates: openers } });
      toast.success("Saved");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally { setBusy(false); }
  }

  async function onToggleStatus() {
    const next = data?.config?.status === "published" ? "draft" : "published";
    setBusy(true);
    try {
      await setStatus({ data: { personaId, status: next } });
      toast.success(next === "published" ? "Marked as published" : "Marked as draft");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    } finally { setBusy(false); }
  }

  if (!data) return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold">{data.persona.display_name}</h2>
          <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
            {data.config?.status ?? "draft"}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onToggleStatus} disabled={busy}>
          Mark as {data.config?.status === "published" ? "draft" : "published"}
        </Button>
      </div>

      <RealMeSyncBadge personaId={personaId} />

      <div className="flex gap-2 border-b border-border">
        {([
          { id: "questionnaire", label: "Questionnaire" },
          { id: "copy", label: "Tone & openers" },
          { id: "preview", label: "Preview" },
          { id: "voice", label: "Voice samples" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={"border-b-2 px-3 py-2 text-sm font-semibold transition " + (
              tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "questionnaire" && (
        <div className="space-y-5">
          <Section title="Voice & personality">
            <Field label="Tone words (comma-separated)">
              <Input
                value={(answers.voicePersonality?.toneWords ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, voicePersonality: { ...a.voicePersonality, toneWords: csv(e.target.value) } }))}
                placeholder="confident, playful, warm, dry-witted"
              />
            </Field>
            <Field label="Pacing">
              <Input
                value={answers.voicePersonality?.pacing ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, voicePersonality: { ...a.voicePersonality, pacing: e.target.value } }))}
                placeholder="Quick and punchy, or slow and thoughtful?"
              />
            </Field>
            <Field label="Humor style">
              <Input
                value={answers.voicePersonality?.humorStyle ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, voicePersonality: { ...a.voicePersonality, humorStyle: e.target.value } }))}
                placeholder="Sarcastic, wholesome, silly, deadpan…"
              />
            </Field>
          </Section>

          <Section title="Boundaries & preferences">
            <Field label="Topics to avoid entirely">
              <Input
                value={(answers.boundariesPreferences?.topicsToAvoid ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, boundariesPreferences: { ...a.boundariesPreferences, topicsToAvoid: csv(e.target.value) } }))}
              />
            </Field>
            <Field label="Topics to lean into">
              <Input
                value={(answers.boundariesPreferences?.topicsToLeanInto ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, boundariesPreferences: { ...a.boundariesPreferences, topicsToLeanInto: csv(e.target.value) } }))}
              />
            </Field>
            <Field label="Phrases / pet names to use">
              <Input
                value={(answers.boundariesPreferences?.phrasesWanted ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, boundariesPreferences: { ...a.boundariesPreferences, phrasesWanted: csv(e.target.value) } }))}
              />
            </Field>
            <Field label="Phrases / pet names to avoid">
              <Input
                value={(answers.boundariesPreferences?.phrasesAvoided ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, boundariesPreferences: { ...a.boundariesPreferences, phrasesAvoided: csv(e.target.value) } }))}
              />
            </Field>
          </Section>

          <Section title="Audience framing">
            <Field label="How should this persona describe itself if asked?">
              <Textarea
                rows={2}
                value={answers.audienceFraming?.selfDescription ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, audienceFraming: { ...a.audienceFraming, selfDescription: e.target.value } }))}
              />
            </Field>
            <Field label="How should it talk about its relationship to Real Me?">
              <Textarea
                rows={2}
                value={answers.audienceFraming?.relationshipToRealMe ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, audienceFraming: { ...a.audienceFraming, relationshipToRealMe: e.target.value } }))}
              />
            </Field>
          </Section>

          <Section title="Content themes">
            <Field label="Subject areas (non-explicit — hobbies, personality, day-in-the-life…)">
              <Input
                value={(answers.contentThemes?.subjectAreas ?? []).join(", ")}
                onChange={(e) => setAnswers((a) => ({ ...a, contentThemes: { ...a.contentThemes, subjectAreas: csv(e.target.value) } }))}
              />
            </Field>
          </Section>

          <Section title="Content framework (creator taste, not a safety setting)">
            <Field label="Preferred posting cadence">
              <Input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="e.g. 3x/week" />
            </Field>
            <Field label="Favorite themes/topics">
              <Input value={favoriteThemes} onChange={(e) => setFavoriteThemes(e.target.value)} placeholder="gym, travel, cooking" />
            </Field>
          </Section>

          <Button onClick={onSaveQuestionnaire} disabled={busy}>{busy ? "Saving…" : "Save questionnaire"}</Button>
        </div>
      )}

      {tab === "copy" && (
        <div className="space-y-4">
          {!data.latestResponse ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Complete the questionnaire first.
            </div>
          ) : (
            <>
              <Button onClick={onGenerate} disabled={busy}>
                <Sparkles className="mr-1.5 size-4" /> {toneGuidelines ? "Regenerate" : "Generate"}
              </Button>
              <Field label="Tone guidelines">
                <Textarea rows={4} value={toneGuidelines} onChange={(e) => setToneGuidelines(e.target.value)} />
              </Field>
              <Field label="Opener templates">
                <div className="space-y-2">
                  {openers.map((o, i) => (
                    <div key={i} className="flex gap-1.5">
                      <Input value={o} onChange={(e) => setOpeners((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
                      <Button variant="ghost" size="sm" onClick={() => setOpeners((arr) => arr.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                  ))}
                  {openers.length < 10 && (
                    <Button variant="outline" size="sm" onClick={() => setOpeners((arr) => [...arr, ""])}>
                      <Plus className="mr-1 size-3.5" /> Add opener
                    </Button>
                  )}
                </div>
              </Field>
              <Button onClick={onSaveCopy} disabled={busy}>{busy ? "Saving…" : "Save edits"}</Button>
            </>
          )}
        </div>
      )}

      {tab === "preview" && (
        <PreviewPanel personaName={data.persona.display_name} toneGuidelines={toneGuidelines} openers={openers} />
      )}

      {tab === "voice" && (
        <VoiceSamplesPanel creatorId={(data.persona as any).creator_id} personaId={personaId} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

function PreviewPanel({ personaName, toneGuidelines, openers }: { personaName: string; toneGuidelines: string; openers: string[] }) {
  if (!toneGuidelines && openers.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Generate tone guidelines and openers to preview them.</div>;
  }
  return (
    <div className="space-y-4">
      {toneGuidelines && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">How {personaName} sounds</div>
          <p className="text-sm text-foreground/85">{toneGuidelines}</p>
        </div>
      )}
      {openers.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sample first messages</div>
          <div className="space-y-2">
            {openers.map((o, i) => (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl border border-ai/20 bg-surface-elevated px-4 py-2 text-sm">
                  {o}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending_validation: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  validated: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  cloned: "border-brand/30 bg-brand/10 text-brand-glow",
};

function VoiceSamplesPanel({ creatorId, personaId }: { creatorId: string; personaId: string }) {
  const list = useServerFn(listVoiceSourceRecordings);
  const removeRecording = useServerFn(deleteVoiceSourceRecording);
  const submitClone = useServerFn(submitVoiceCloneJob);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await list({ data: { personaId } });
      setRecordings(r.recordings);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load recordings");
    }
  }, [list, personaId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await removeRecording({ data: { recordingId: id } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally { setBusy(false); }
  }

  async function onSubmitForCloning() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await submitClone({ data: { personaId, recordingIds: [...selected] } });
      toast.success(res.note);
      setSelected(new Set());
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally { setBusy(false); }
  }

  const validated = recordings.filter((r) => r.status === "validated" && !r.submitted_for_clone_at);

  return (
    <div className="space-y-4">
      <VoiceSourceRecorder creatorId={creatorId} personaId={personaId} onUploaded={refresh} />

      {validated.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <Button size="sm" onClick={onSubmitForCloning} disabled={busy || selected.size === 0}>Submit for voice cloning</Button>
        </div>
      )}

      <div className="space-y-2">
        {recordings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No voice samples yet.</div>
        ) : (
          recordings.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              {r.status === "validated" && !r.submitted_for_clone_at && (
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={() => setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                    return next;
                  })}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {r.source_type === "recorded_in_app" ? "Recorded in-app" : "Uploaded file"} · {Math.round(r.duration_seconds)}s · {r.format.toUpperCase()} · {r.sample_rate}Hz
                </div>
                {r.rejection_reason && <div className="mt-1 text-xs text-destructive">{r.rejection_reason}</div>}
                {r.submitted_for_clone_at && <div className="mt-1 text-xs text-brand-glow">Submitted for cloning</div>}
              </div>
              <Badge variant="outline" className={"text-[10px] uppercase tracking-widest " + (STATUS_TONE[r.status] ?? "")}>{r.status.replace("_", " ")}</Badge>
              <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)} disabled={busy}>Delete</Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RealMeSyncBadge({ personaId }: { personaId: string }) {
  const getStatus = useServerFn(getPersonaRealMeSyncStatus);
  const resync = useServerFn(resyncPersonaToRealMe);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getPersonaRealMeSyncStatus>> | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await getStatus({ data: { personaId } });
      setStatus(r);
    } catch { /* non-critical, fail quiet */ }
  };
  useEffect(() => { refresh(); /* eslint-disable-line */ }, [personaId]);

  async function onResync() {
    setBusy(true);
    try {
      await resync({ data: { personaId } });
      toast.success("Synced to the latest Real Me version");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resync");
    } finally { setBusy(false); }
  }

  if (!status || !status.hasProfile) return null;

  if (!status.referencedVersionId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-surface p-2.5 text-xs text-muted-foreground">
        <span>Not yet linked to your Real Me baseline.</span>
        <Button size="sm" variant="outline" onClick={onResync} disabled={busy}>Link now</Button>
      </div>
    );
  }

  if (status.needsResync) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-200">
        <span>Your Real Me baseline has been updated since this persona last synced.</span>
        <Button size="sm" onClick={onResync} disabled={busy}>{busy ? "Syncing…" : "Resync now"}</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-2.5 text-xs text-emerald-300">
      Synced to your current Real Me baseline.
    </div>
  );
}
