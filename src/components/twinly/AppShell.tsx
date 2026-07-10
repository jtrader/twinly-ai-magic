import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Home, MessageCircle, LayoutDashboard, User, Menu, CreditCard, Heart, LogOut, Settings, LogIn, Wallet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createBillingPortal } from "@/lib/checkout.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/twinly/ImpersonationBanner";
import { NotificationBell } from "@/components/twinly/NotificationBell";
import { PaymentTestModeBanner } from "@/components/twinly/PaymentTestModeBanner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";

export function AppShell({ children, mobileNav = true }: { children: ReactNode; mobileNav?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
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
          Twinly<span className="text-brand-glow">.life</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden text-[10px] font-semibold uppercase tracking-widest text-muted-foreground sm:block">
            Verified · AI disclosed
          </div>
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function AccountMenu() {
  const { user } = useSession();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 bg-surface text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Menu className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account"><User className="mr-2 size-4" />Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/account/subscriptions"><CreditCard className="mr-2 size-4" />Subscriptions</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/account/following"><Heart className="mr-2 size-4" />Following & Favorites</Link>
            </DropdownMenuItem>
            <BillingPortalMenuItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account"><Settings className="mr-2 size-4" />Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 size-4" />Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to="/auth"><LogIn className="mr-2 size-4" />Log in</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/auth"><User className="mr-2 size-4" />Join Twinly.life</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BillingPortalMenuItem() {
  const openPortal = useServerFn(createBillingPortal);
  const [busy, setBusy] = useState(false);
  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isPaymentsConfigured()) { toast.error("Payments not configured"); return; }
    setBusy(true);
    try {
      const res = await openPortal({
        data: { returnUrl: window.location.href, environment: getStripeEnvironment() },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenuItem onClick={handleClick} disabled={busy}>
      <Wallet className="mr-2 size-4" />
      {busy ? "Opening…" : "Billing portal"}
    </DropdownMenuItem>
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