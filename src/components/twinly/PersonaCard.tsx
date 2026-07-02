import { Link } from "@tanstack/react-router";
import { PersonaBadge } from "./PersonaBadge";
import { cn } from "@/lib/utils";

export interface PersonaCardProps {
  id: string;
  slug: string;
  displayName: string;
  description?: string | null;
  kind: "real_me" | "ai";
  disclosureLabel: string;
  priceCents: number;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function PersonaCard(p: PersonaCardProps) {
  const body = (
    <div className={cn(
      "group relative flex h-full flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition hover:border-brand/40 hover:bg-surface-elevated",
      p.className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-semibold text-foreground">{p.displayName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{p.disclosureLabel}</div>
        </div>
        <PersonaBadge kind={p.kind} />
      </div>
      {p.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
      )}
      <div className="mt-6 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {p.priceCents > 0 ? `$${(p.priceCents / 100).toFixed(2)}` : "Included"}
        </span>
        <span className="text-xs font-semibold text-brand-glow group-hover:translate-x-0.5 transition">Enter →</span>
      </div>
    </div>
  );
  if (p.href) return <a href={p.href} className="block h-full">{body}</a>;
  return <button type="button" onClick={p.onClick} className="block w-full text-left h-full">{body}</button>;
}