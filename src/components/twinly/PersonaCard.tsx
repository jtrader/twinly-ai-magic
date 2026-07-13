import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
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
  avatarUrl?: string | null;
  href?: string;
  onClick?: () => void;
  className?: string;
  hasIntroVideo?: boolean;
  onPlayIntro?: () => void;
}

export function PersonaCard(p: PersonaCardProps) {
  const body = (
    <div className={cn(
      "group relative flex h-full flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition hover:border-brand/40 hover:bg-surface-elevated",
      p.className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PersonaBadge kind={p.kind} />
            <div className="font-display text-lg font-semibold text-foreground">{p.displayName}</div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{p.disclosureLabel}</div>
          {p.description && (
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
          )}
        </div>
        {p.avatarUrl && (
          <div className="relative shrink-0 self-center">
            <div className="absolute inset-0 rounded-full bg-brand-glow/40 blur-md" aria-hidden />
            <img
              src={p.avatarUrl}
              alt={p.displayName}
              loading="lazy"
              className="relative size-16 rounded-full border-2 border-brand-glow/70 object-cover shadow-[0_0_18px_-2px_hsl(var(--brand-glow)/0.55)] sm:size-20"
            />
            {p.hasIntroVideo && (
              <button
                type="button"
                aria-label={`Play ${p.displayName}'s intro video`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); p.onPlayIntro?.(); }}
                className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-brand text-brand-foreground shadow-md transition hover:bg-brand/90"
              >
                <Play className="size-3.5 fill-current" />
              </button>
            )}
          </div>
        )}
      </div>
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