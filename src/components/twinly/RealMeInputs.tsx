import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Search } from "lucide-react";

export function MultiSelectInput({
  options, value, onChange,
}: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => (query.trim() ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())) : options),
    [options, query],
  );

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <div className="space-y-2">
      {options.length > 10 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter options…" className="h-8 pl-8 text-sm" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {filtered.map((option) => {
          const selected = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={"rounded-full border px-3 py-1.5 text-sm transition " + (
                selected ? "border-brand bg-brand/15 text-brand-glow" : "border-border bg-surface text-foreground/80 hover:border-brand/40"
              )}
            >
              {option}
            </button>
          );
        })}
        {filtered.length === 0 && <span className="text-xs text-muted-foreground">No matches.</span>}
      </div>
    </div>
  );
}

export function SingleSelectInput({
  options, value, onChange, allowCustomOption,
}: { options: string[]; value: string; onChange: (v: string) => void; allowCustomOption?: boolean }) {
  const isCustomValue = allowCustomOption && value !== "" && !options.includes(value);
  const [mode, setMode] = useState<"preset" | "custom">(isCustomValue ? "custom" : "preset");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => { setMode("preset"); onChange(option); }}
            className={"rounded-full border px-3 py-1.5 text-sm transition " + (
              mode === "preset" && value === option ? "border-brand bg-brand/15 text-brand-glow" : "border-border bg-surface text-foreground/80 hover:border-brand/40"
            )}
          >
            {option}
          </button>
        ))}
        {allowCustomOption && (
          <button
            type="button"
            onClick={() => { setMode("custom"); onChange(""); }}
            className={"rounded-full border px-3 py-1.5 text-sm transition " + (
              mode === "custom" ? "border-brand bg-brand/15 text-brand-glow" : "border-border bg-surface text-foreground/80 hover:border-brand/40"
            )}
          >
            Something else…
          </button>
        )}
      </div>
      {mode === "custom" && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type your own" className="text-sm" />
      )}
    </div>
  );
}

export function YesNoInput({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2">
      {([{ label: "Yes", v: true }, { label: "No", v: false }] as const).map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.v)}
          className={"rounded-full border px-4 py-1.5 text-sm font-medium transition " + (
            value === opt.v ? "border-brand bg-brand/15 text-brand-glow" : "border-border bg-surface text-foreground/80 hover:border-brand/40"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Slider min={1} max={10} step={1} value={[value || 5]} onValueChange={([v]) => onChange(v)} className="max-w-xs" />
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{value || 5}</span>
    </div>
  );
}

export function CustomPromptInput({
  value, onChange, maxLength = 500,
}: { value: string; onChange: (v: string) => void; maxLength?: number }) {
  return (
    <div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLength))} rows={3} className="text-sm" />
      <div className="mt-1 text-right text-[10px] text-muted-foreground">{value.length}/{maxLength}</div>
    </div>
  );
}
