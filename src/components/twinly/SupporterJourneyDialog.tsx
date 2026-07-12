import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  HeartHandshake,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_JOURNEY_ANSWERS,
  type PersonaTemplate,
  type SupporterJourneyAnswers,
} from "@/lib/supporter-journey";
import { getSupporterJourneyDraft, saveSupporterJourney } from "@/lib/supporter-journey.functions";
import { submitRspQuestionnaire } from "@/lib/rsp-bridge.functions";

type Tier = "base" | "plus" | "vip";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  tier: Tier;
  onComplete: () => void;
};

function getPersonas(creatorName: string): { id: PersonaTemplate; label: string; blurb: string }[] {
  return [
    { id: "real", label: "Real", blurb: "Natural, candid and behind the scenes" },
    { id: "nice", label: "Nice", blurb: "Warm, positive and encouraging" },
    { id: "naughty", label: "Naughty · 18+", blurb: "Cheeky and teasing, never explicit" },
    { id: "wicked", label: "Wicked · 18+", blurb: "Bold and mysterious, never explicit" },
    { id: "custom", label: "Custom", blurb: `${creatorName}'s creator-defined style` },
  ];
}
const INTERESTS = [
  "Behind the scenes",
  "Fashion",
  "Fitness",
  "Cosplay",
  "Storytelling",
  "Humour",
  "Playful teasing",
  "Creative process",
  "Travel",
  "Games",
];
const FORMATS = [
  "Photos",
  "Photo sets",
  "Short videos",
  "Longer videos",
  "Audio messages",
  "Voice notes",
  "Written stories",
  "Polls",
  "Livestreams",
  "Bundles",
];
const ENVIRONMENTS: Record<PersonaTemplate, string[]> = {
  real: ["Creator studio", "Coffee conversation", "Behind-the-scenes set", "Outdoor walk-and-talk"],
  nice: ["Cosy lounge", "Friendly café", "Peaceful garden", "Bright creative studio"],
  naughty: ["Playful game room", "Glamorous dressing room", "Neon lounge", "After-hours studio"],
  wicked: ["Mysterious private club", "Cinematic penthouse", "Midnight rooftop", "Secret archive"],
  custom: ["Realistic", "Cinematic", "Fantasy-inspired", "Creator-defined setting"],
};

function ChoiceCards({
  options,
  selected,
  onSelect,
  multi = false,
}: {
  options: string[];
  selected: string | string[];
  onSelect: (value: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const active = multi ? (selected as string[]).includes(option) : selected === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${active ? "border-brand-glow bg-brand/15 text-foreground" : "border-border bg-background/40 text-muted-foreground hover:border-brand/60"}`}
          >
            <span>{option}</span>
            {active && <Check className="size-4 text-brand-glow" />}
          </button>
        );
      })}
    </div>
  );
}

export function SupporterJourneyDialog(props: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SupporterJourneyAnswers>(DEFAULT_JOURNEY_ANSWERS);
  const [saving, setSaving] = useState(false);
  const loadDraft = useServerFn(getSupporterJourneyDraft);
  const saveJourney = useServerFn(saveSupporterJourney);
  const submitRsp = useServerFn(submitRspQuestionnaire);
  const mature = answers.persona === "naughty" || answers.persona === "wicked";
  const personas = useMemo(() => getPersonas(props.creatorName), [props.creatorName]);
  const steps = 9;

  useEffect(() => {
    if (!props.open) return;
    setStep(0);
    loadDraft({ data: { creatorId: props.creatorId } })
      .then((row: { answers?: Partial<SupporterJourneyAnswers> } | null) => {
        if (row?.answers) setAnswers({ ...DEFAULT_JOURNEY_ANSWERS, ...row.answers });
      })
      .catch(() => {});
  }, [props.open, props.creatorId, loadDraft]);

  const canContinue = useMemo(() => {
    if (step === 0) return answers.respectfulUse && answers.personaliseAllowed;
    if (step === 1) return !mature || answers.adultConfirmed;
    if (step === 2) return !!answers.displayName.trim() && !!answers.objective;
    if (step === 5) return answers.interests.length > 0;
    if (step === 6) return answers.formats.length > 0;
    return true;
  }, [step, answers, mature]);

  function update<K extends keyof SupporterJourneyAnswers>(
    key: K,
    value: SupporterJourneyAnswers[K],
  ) {
    setAnswers((old) => ({ ...old, [key]: value }));
  }
  function toggle(key: "interests" | "formats", value: string) {
    update(
      key,
      answers[key].includes(value)
        ? answers[key].filter((x) => x !== value)
        : [...answers[key], value],
    );
  }
  async function persist(submitted: boolean) {
    setSaving(true);
    try {
      if (submitted) {
        await submitRsp({
          data: {
            creatorId: props.creatorId,
            intake: {
              schemaVersion: "2.0",
              questionnaire: answers,
              consentReceipt: {
                consentVersion: "supporter-journey-v2",
                acceptedAt: new Date().toISOString(),
                adultConfirmed: answers.adultConfirmed,
                respectfulUseAccepted: answers.respectfulUse,
                personalisationAllowed: answers.personaliseAllowed,
                preferencesMayBeSaved: answers.savePreferences,
              },
              sessionContext: {
                questionnaireId: crypto.randomUUID(),
                questionnaireVersion: "2.0",
                source: "supporter_onboarding",
                locale: "en-AU",
              },
            },
          },
        });
      } else {
        await saveJourney({
          data: { creatorId: props.creatorId, tier: props.tier, answers, submitted: false },
        });
      }
      if (submitted) {
        toast.success("Your experience is ready. Continue to secure checkout.");
        props.onComplete();
      } else {
        toast.success("Saved — you can continue later.");
        props.onOpenChange(false);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save your preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 pb-4 pt-6 backdrop-blur">
          <div className="flex items-center gap-3">
            {props.creatorAvatarUrl ? (
              <img
                src={props.creatorAvatarUrl}
                alt=""
                className="size-11 rounded-full border border-brand-glow/40 object-cover"
              />
            ) : (
              <div className="grid size-11 place-items-center rounded-full bg-brand/15">
                <Sparkles className="size-5 text-brand-glow" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle>Shape your experience with {props.creatorName}</DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                One question at a time · Step {step + 1} of {steps}
              </p>
            </div>
          </div>
          <Progress value={((step + 1) / steps) * 100} className="mt-4" />
        </DialogHeader>

        <div className="min-h-[390px] px-6 py-6">
          {step === 0 && (
            <Question
              icon={<HeartHandshake className="size-5" />}
              title="Before we personalise things"
              help="Your answers shape chat and recommendations. They are never permission to cross a boundary."
            >
              <ToggleLine
                checked={answers.respectfulUse}
                onChange={(v) => update("respectfulUse", v)}
                label={`I’ll use ${props.creatorName}'s experience respectfully and follow their boundaries.`}
              />
              <ToggleLine
                checked={answers.personaliseAllowed}
                onChange={(v) => update("personaliseAllowed", v)}
                label="Use my answers to personalise chat and content recommendations."
              />
              <div className="flex flex-wrap gap-3 text-xs text-brand-glow">
                <Link to="/legal/privacy">Privacy notice</Link>
                <Link to="/legal/terms">Creator boundaries & terms</Link>
                <span>Reset or deletion is available on request</span>
              </div>
            </Question>
          )}

          {step === 1 && (
            <Question
              title="Which persona should welcome you?"
              help="You can change this later. Naughty and Wicked are adults-only and stay non-explicit."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => update("persona", p.id)}
                    className={`rounded-xl border p-4 text-left ${answers.persona === p.id ? "border-brand-glow bg-brand/15" : "border-border bg-background/40"}`}
                  >
                    <div className="flex justify-between font-semibold">
                      {p.label}
                      {answers.persona === p.id && <Check className="size-4 text-brand-glow" />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
                  </button>
                ))}
              </div>
              {mature && (
                <ToggleLine
                  checked={answers.adultConfirmed}
                  onChange={(v) => update("adultConfirmed", v)}
                  label="I confirm I am 18 years of age or older."
                  emphasis
                />
              )}
            </Question>
          )}

          {step === 2 && (
            <Question
              title="What should we call you?"
              help="Use a nickname if you prefer. Avoid sharing sensitive personal information."
            >
              <Input
                value={answers.displayName}
                onChange={(e) => update("displayName", e.target.value.slice(0, 60))}
                placeholder="Name or nickname"
                autoFocus
              />
              <p className="text-sm font-medium">What brought you here today?</p>
              <ChoiceCards
                options={[
                  "Content discovery",
                  "Casual chat",
                  "Behind-the-scenes access",
                  "A personalised recommendation",
                  "Custom-content enquiry",
                  "Relaxation",
                ]}
                selected={answers.objective
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                onSelect={(v) => update("objective", v.toLowerCase().replaceAll(" ", "_"))}
              />
            </Question>
          )}

          {step === 3 && (
            <Question
              title="How should the conversation feel?"
              help="Slide each preference to the level that feels right."
            >
              <PreferenceSlider
                label="Short"
                end="Detailed"
                value={answers.messageDetail}
                onChange={(v) => update("messageDetail", v)}
              />
              <PreferenceSlider
                label="Calm"
                end="Playful"
                value={answers.playfulness}
                onChange={(v) => update("playfulness", v)}
              />
              <PreferenceSlider
                label="Mysterious"
                end="Direct"
                value={answers.directness}
                onChange={(v) => update("directness", v)}
              />
              <PreferenceSlider
                label="Serious"
                end="Humorous"
                value={answers.humour}
                onChange={(v) => update("humour", v)}
              />
            </Question>
          )}

          {step === 4 && (
            <Question
              title="Choose your chat atmosphere"
              help="The persona may lightly refer to this setting; it never claims the scene is physically real."
            >
              <ChoiceCards
                options={ENVIRONMENTS[answers.persona]}
                selected={answers.environment}
                onSelect={(v) => update("environment", v)}
              />
              <PreferenceSlider
                label="Light touch"
                end="Immersive"
                value={answers.immersion}
                onChange={(v) => update("immersion", v)}
              />
            </Question>
          )}

          {step === 5 && (
            <Question
              title="What are you interested in?"
              help="Choose one or more high-level themes. You stay in control of what is included."
            >
              <ChoiceCards
                options={INTERESTS}
                selected={answers.interests}
                onSelect={(v) => toggle("interests", v)}
                multi
              />
            </Question>
          )}

          {step === 6 && (
            <Question
              title="Which content formats do you enjoy?"
              help="Select your favourites. Recommendations are suggestions only and are never published or purchased automatically."
            >
              <ChoiceCards
                options={FORMATS}
                selected={answers.formats}
                onSelect={(v) => toggle("formats", v)}
                multi
              />
              <p className="text-xs text-muted-foreground">
                Selected {answers.formats.length}; your first three are treated as top formats.
              </p>
            </Question>
          )}

          {step === 7 && (
            <Question
              icon={<ShieldCheck className="size-5" />}
              title="Set your comfort and boundaries"
              help="A missing answer is never treated as consent. You can reduce intensity or change topic at any time."
            >
              <p className="text-sm font-medium">Non-explicit playful teasing</p>
              <ChoiceCards
                options={["Comfortable", "Ask first", "Not comfortable"]}
                selected={answers.teasingConsent
                  .replace("_", " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                onSelect={(v) =>
                  update(
                    "teasingConsent",
                    v === "Comfortable"
                      ? "comfortable"
                      : v === "Ask first"
                        ? "ask_first"
                        : "not_comfortable",
                  )
                }
              />
              <Textarea
                value={answers.excludedTopics}
                onChange={(e) => update("excludedTopics", e.target.value.slice(0, 500))}
                placeholder="Topics, words or styles to never include (comma separated)"
              />
              <p className="text-sm font-medium">Paid-content suggestions</p>
              <ChoiceCards
                options={["Never", "Occasionally", "Only when I ask"]}
                selected={answers.offerFrequency
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                onSelect={(v) => update("offerFrequency", v.toLowerCase().replaceAll(" ", "_"))}
              />
            </Question>
          )}

          {step === 8 && (
            <Question
              title="Review and choose what is saved"
              help="This creates an editable Chat Experience Brief and Tailored Content Brief. Nothing is automatically sent, generated, published or purchased."
            >
              <Review answers={answers} />
              <ToggleLine
                checked={answers.savePreferences}
                onChange={(v) => {
                  update("savePreferences", v);
                  if (!v) {
                    update("retentionDays", 0);
                    update("futurePersonalisation", false);
                  }
                }}
                label="Save my preferences for future visits."
              />
              {answers.savePreferences && (
                <>
                  <ChoiceCards
                    options={["30 days", "90 days", "365 days"]}
                    selected={`${answers.retentionDays} days`}
                    onSelect={(v) => update("retentionDays", Number(v.split(" ")[0]))}
                  />
                  <ToggleLine
                    checked={answers.futurePersonalisation}
                    onChange={(v) => update("futurePersonalisation", v)}
                    label="Reuse these preferences for future personalisation."
                  />
                </>
              )}
            </Question>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-6 py-4 backdrop-blur">
          <Button
            variant="ghost"
            disabled={step === 0 || saving}
            onClick={() => setStep((s) => s - 1)}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={() => persist(false)}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save for later
            </Button>
            {step < steps - 1 ? (
              <Button disabled={!canContinue || saving} onClick={() => setStep((s) => s + 1)}>
                Continue
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : (
              <Button disabled={!canContinue || saving} onClick={() => persist(true)}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Confirm & checkout
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Question({
  title,
  help,
  icon,
  children,
}: {
  title: string;
  help: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        {icon && (
          <div className="mb-3 grid size-10 place-items-center rounded-full bg-brand/15 text-brand-glow">
            {icon}
          </div>
        )}
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{help}</p>
      </div>
      {children}
    </div>
  );
}
function ToggleLine({
  checked,
  onChange,
  label,
  emphasis,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${checked ? "border-brand-glow bg-brand/10" : "border-border"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className={`text-sm ${emphasis ? "font-semibold" : ""}`}>{label}</span>
    </label>
  );
}
function PreferenceSlider({
  label,
  end,
  value,
  onChange,
}: {
  label: string;
  end: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{end}</span>
      </div>
      <Slider value={[value]} max={100} step={10} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
function Review({ answers }: { answers: SupporterJourneyAnswers }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-surface p-4 text-sm sm:grid-cols-2">
      <ReviewRow label="Persona" value={answers.persona} />
      <ReviewRow label="Atmosphere" value={answers.environment} />
      <ReviewRow label="Interests" value={answers.interests.join(", ")} />
      <ReviewRow label="Formats" value={answers.formats.slice(0, 3).join(", ")} />
      <ReviewRow label="Teasing" value={answers.teasingConsent.replaceAll("_", " ")} />
      <ReviewRow label="Offers" value={answers.offerFrequency.replaceAll("_", " ")} />
    </div>
  );
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className="capitalize">{value || "None"}</p>
    </div>
  );
}
