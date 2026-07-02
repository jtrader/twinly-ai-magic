import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home, MessageCircle, LayoutDashboard, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/twinly/ImpersonationBanner";

export function AppShell({ children, mobileNav = true }: { children: ReactNode; mobileNav?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <ImpersonationBanner />
      <main className={cn("mx-auto max-w-6xl px-4 pb-24 pt-4 md:pt-8", mobileNav && "pb-24")}>{children}</main>
      {mobileNav && <BottomNav />}
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-1 font-display text-lg font-bold tracking-tight">
          Twinly<span className="text-brand-glow">.ai</span>
        </Link>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Verified · AI disclosed
        </div>
      </div>
    </header>
  );
}

const NAV = [
  { to: "/discover", label: "Discover", icon: Home },
  { to: "/app", label: "Home", icon: LayoutDashboard },
  { to: "/account", label: "Me", icon: User },
] as const;

function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-6xl grid-cols-3 px-2 py-2">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link key={to} to={to} className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium",
              active ? "text-brand-glow" : "text-muted-foreground",
            )}>
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}