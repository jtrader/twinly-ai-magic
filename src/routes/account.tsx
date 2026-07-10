import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { User, CreditCard, Heart } from "lucide-react";
import { AppShell } from "@/components/twinly/AppShell";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/account")({ component: AccountLayout });

const NAV = [
  { to: "/account", label: "Profile", icon: User, exact: true },
  { to: "/account/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/account/following", label: "Following & Favorites", icon: Heart },
] as const;

function AccountLayout() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  return (
    <AppShell>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <div className="rounded-2xl border border-border bg-surface p-2">
            <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {NAV.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand/15 text-brand-glow"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </AppShell>
  );
}