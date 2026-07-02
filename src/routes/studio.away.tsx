import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session";
import { getAwaySettings, updateAwaySettings, type AwaySettings } from "@/lib/away.functions";
import { toast } from "sonner";
import { Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/studio/away")({
  component: AwayPage,
  head: () => ({
    meta: [
      { title: "Away mode — Twinly.life" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AwayPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AwaySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (!user) return;
    getAwaySettings().then((s) => setSettings(s)).catch((e) => toast.error(e.message));
  }, [user]);

  const patch = async (delta: Partial<AwaySettings>) => {
    setSaving(true);
    try {
      const next = await updateAwaySettings({ data: delta });
      setSettings({
        away_mode: next.away_mode,
        away_message: next.away_message,
        away_auto_reply_enabled: next.away_auto_reply_enabled,
        away_allow_ai_personas: next.away_allow_ai_personas,
        away_started_at: next.away_started_at,
      });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <AppShell><div className="mx-auto max-w-md py-12 text-center text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Away mode</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set an auto-reply for Real Me and choose whether your AI personas keep chatting while you're offline.</p>
        </div>

        {/* Master toggle */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`grid size-10 place-items-center rounded-xl border ${settings.away_mode ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-border bg-surface-elevated text-muted-foreground"}`}>
                {settings.away_mode ? <Moon className="size-5" /> : <Sun className="size-5" />}
              </div>
              <div>
                <div className="font-display text-lg font-semibold">{settings.away_mode ? "Away" : "Available"}</div>
                <div className="text-sm text-muted-foreground">
                  {settings.away_mode
                    ? `On since ${settings.away_started_at ? new Date(settings.away_started_at).toLocaleString() : "just now"}`
                    : "Fans see you as online for Real Me chat."}
                </div>
              </div>
            </div>
            <Toggle checked={settings.away_mode} disabled={saving} onChange={(v) => patch({ away_mode: v })} />
          </div>
        </div>

        {/* Response rules */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <div className="font-display text-base font-semibold">Response rules</div>
          <p className="mt-1 text-xs text-muted-foreground">Applied only when Away mode is on.</p>

          <div className="mt-4 space-y-3">
            <Row
              label="Send auto-reply on Real Me"
              desc="Fans messaging your Real Me persona get a system reply with your away message."
              checked={settings.away_auto_reply_enabled}
              disabled={saving}
              onChange={(v) => patch({ away_auto_reply_enabled: v })}
            />
            <Row
              label="Keep AI personas active"
              desc="Fans can still chat with your Nice / Naughty / Wicked AI personas while you're away."
              checked={settings.away_allow_ai_personas}
              disabled={saving}
              onChange={(v) => patch({ away_allow_ai_personas: v })}
            />
          </div>
        </div>

        {/* Away message editor */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <div className="font-display text-base font-semibold">Away auto-reply message</div>
          <p className="mt-1 text-xs text-muted-foreground">Up to 500 characters. Shown to fans on Real Me when you're away.</p>
          <AwayMessageEditor
            initial={settings.away_message}
            disabled={saving}
            onSave={(m) => patch({ away_message: m })}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface/60 p-4 text-xs text-muted-foreground">
          Tip: Your persona list shows an "Away" badge to fans on the public profile and chat header when Away mode is on.
        </div>
      </div>
    </AppShell>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? "bg-brand" : "bg-muted"} ${disabled ? "opacity-60" : ""}`}
      aria-pressed={checked}
    >
      <span className={`inline-block size-5 rounded-full bg-white transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function Row({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-elevated p-3">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function AwayMessageEditor({ initial, onSave, disabled }: { initial: string; onSave: (m: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  const dirty = value.trim() !== initial.trim();
  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="min-h-[120px] w-full resize-y rounded-xl border border-border bg-surface-elevated p-3 text-sm outline-none focus:border-brand"
        value={value}
        maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Hey! I'm away right now — I'll reply personally when I'm back."
      />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{value.length}/500</span>
        <Button size="sm" disabled={!dirty || disabled} onClick={() => onSave(value.trim())}>Save message</Button>
      </div>
    </div>
  );
}

export { Input };