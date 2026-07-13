import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SectionLink = { to: string; label: string; group?: string };

// Human labels for each dashboard route segment.
const LABELS: Record<string, string> = {
  studio: "Creator Studio",
  admin: "Admin Console",
  agency: "Agency",
  fan: "Your Dashboard",
  account: "Account",
  secure: "Secure",
  personas: "Personas",
  "ai-review": "AI Review",
  "real-me": "Real Me",
  "twin-onboarding": "Twin Onboarding",
  "persona-onboarding": "Persona Onboarding",
  "feed-visibility": "Feed Visibility",
  packs: "Content Packs",
  content: "Content Vault",
  create: "Twinly Create",
  generate: "AI Generate",
  inbox: "Real Me Inbox",
  flags: "Flagged Chats",
  escalations: "Real Me Requests",
  payouts: "Payouts",
  pricing: "Pricing",
  polls: "Polls",
  analytics: "Analytics",
  twin: "Digital Twin",
  away: "Away Mode",
  following: "Following",
  subscriptions: "Subscriptions",
  setup: "Setup",
  unlocks: "Unlocks",
};

const STUDIO_SECTIONS: SectionLink[] = [
  { to: "/studio", label: "Overview", group: "Home" },
  { to: "/studio/real-me", label: "Real Me baseline", group: "Foundations" },
  { to: "/studio/twin", label: "Digital twin", group: "Foundations" },
  { to: "/studio/twin-onboarding", label: "Twin onboarding", group: "Foundations" },
  { to: "/secure/personas", label: "Secure persona hub", group: "Foundations" },
  { to: "/studio/personas", label: "Persona studio", group: "Personas" },
  { to: "/studio/persona-onboarding", label: "Persona onboarding", group: "Personas" },
  { to: "/studio/ai-review", label: "AI persona review", group: "Personas" },
  { to: "/studio/flags", label: "Flagged AI chats", group: "Personas" },
  { to: "/studio/content", label: "Content vault", group: "Content" },
  { to: "/studio/packs", label: "Content packs", group: "Content" },
  { to: "/studio/create", label: "Twinly Create", group: "Content" },
  { to: "/studio/generate", label: "AI generate", group: "Content" },
  { to: "/studio/polls", label: "Polls", group: "Content" },
  { to: "/studio/feed-visibility", label: "Feed visibility", group: "Content" },
  { to: "/studio/inbox", label: "Real Me inbox", group: "Engagement" },
  { to: "/studio/escalations", label: "Real Me requests", group: "Engagement" },
  { to: "/studio/away", label: "Away mode", group: "Engagement" },
  { to: "/studio/pricing", label: "Subscription pricing", group: "Monetisation" },
  { to: "/studio/payouts", label: "Payouts", group: "Monetisation" },
  { to: "/studio/analytics", label: "Analytics", group: "Monetisation" },
];

const FAN_SECTIONS: SectionLink[] = [
  { to: "/fan", label: "Overview" },
  { to: "/fan/unlocks", label: "Unlocks" },
  { to: "/fan/flags", label: "Flagged chats" },
  { to: "/account", label: "Account" },
  { to: "/account/following", label: "Following & favorites" },
  { to: "/account/subscriptions", label: "Subscriptions" },
];

const ACCOUNT_SECTIONS: SectionLink[] = [
  { to: "/account", label: "Profile" },
  { to: "/account/setup", label: "Account setup" },
  { to: "/account/following", label: "Following & favorites" },
  { to: "/account/subscriptions", label: "Subscriptions" },
];

function humanize(seg: string): string {
  if (LABELS[seg]) return LABELS[seg];
  if (seg.startsWith("$")) return seg.slice(1);
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSection(pathname: string): { key: string; label: string; menu?: SectionLink[] } | null {
  if (pathname.startsWith("/studio") || pathname.startsWith("/secure/personas"))
    return { key: "studio", label: "Creator Studio", menu: STUDIO_SECTIONS };
  if (pathname.startsWith("/admin")) return { key: "admin", label: "Admin Console" };
  if (pathname.startsWith("/agency")) return { key: "agency", label: "Agency" };
  if (pathname.startsWith("/fan")) return { key: "fan", label: "Your Dashboard", menu: FAN_SECTIONS };
  if (pathname.startsWith("/account")) return { key: "account", label: "Account", menu: ACCOUNT_SECTIONS };
  return null;
}

export function DashboardNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = getSection(pathname);
  if (!section) return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const to = "/" + segments.slice(0, i + 1).join("/");
    return { to, label: humanize(seg), last: i === segments.length - 1 };
  });

  const groups = section.menu
    ? section.menu.reduce<Record<string, SectionLink[]>>((acc, item) => {
        const g = item.group ?? "";
        (acc[g] ||= []).push(item);
        return acc;
      }, {})
    : null;

  return (
    <div className="border-b border-border/60 bg-surface/30">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="text-xs">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {crumbs.map((c) => (
              <span key={c.to} className="inline-flex items-center gap-1.5">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {c.last ? (
                    <BreadcrumbPage className="text-xs">{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.to as any} className="text-xs">{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        {groups && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              Jump to {section.label} section
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
              {Object.entries(groups).map(([group, items], gi) => (
                <div key={group || gi}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  {group && (
                    <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group}
                    </DropdownMenuLabel>
                  )}
                  {items.map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link
                        to={item.to as any}
                        className={
                          "cursor-pointer " +
                          (pathname === item.to ? "font-semibold text-brand-glow" : "")
                        }
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
