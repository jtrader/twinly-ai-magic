import { Link, useRouterState } from "@tanstack/react-router";
import { Eye, Palette, Building2, ShieldCheck } from "lucide-react";
import { useSession, useUserRoles } from "@/lib/session";
import { cn } from "@/lib/utils";

// Admin-only "preview mode" toolbar: one click to see the app as a
// Supporter (fan feed), Creator (studio) or Agency (agency dashboard).
// No impersonation — the admin stays signed in as themselves, they're just
// jumping between the three role-specific surfaces.
//
// For real impersonation (sign in as a specific supporter/creator/agency
// owner), the admin still uses the /admin console tabs.
const VIEWS = [
  { id: "supporter", to: "/app",    label: "Supporter view", short: "Supporter", icon: Eye,          match: ["/app", "/discover", "/creators", "/pricing"] },
  { id: "creator",   to: "/studio", label: "Creator view",   short: "Creator",   icon: Palette,      match: ["/studio"] },
  { id: "agency",    to: "/agency", label: "Agency view",    short: "Agency",    icon: Building2,    match: ["/agency"] },
] as const;

export function AdminViewSwitcher() {
  const { user } = useSession();
  const roles = useUserRoles(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user || !roles.includes("admin")) return null;
  // Hide inside the admin console itself — the console has its own nav.
  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="sticky top-14 z-30 border-b border-brand/30 bg-brand/5 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-background/60 px-2 py-0.5 font-semibold uppercase tracking-widest text-brand-glow">
          <ShieldCheck className="size-3" aria-hidden />
          Admin views
        </span>
        <span className="hidden text-muted-foreground sm:inline">Preview the app as:</span>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Admin role preview switcher">
          {VIEWS.map((v) => {
            const active = v.match.some((p) => pathname === p || pathname.startsWith(p + "/"));
            const Icon = v.icon;
            return (
              <Link
                key={v.id}
                to={v.to}
                aria-label={v.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium transition-colors",
                  active
                    ? "border-brand/60 bg-brand text-brand-foreground"
                    : "border-border/60 bg-surface text-muted-foreground hover:border-brand/40 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {v.short}
              </Link>
            );
          })}
          <Link
            to="/admin"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface px-2 py-1 font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Admin console
          </Link>
        </nav>
      </div>
    </div>
  );
}