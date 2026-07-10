import { Link } from "@tanstack/react-router";
import { Bot, Boxes, ImagePlus, LockKeyhole, ShieldCheck, Sparkles, UserRoundCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const setupSteps = [
  {
    title: "Create AI personas",
    description: "Build default or custom personas such as Nice AI, Naughty AI, Wicked AI, seasonal drops, or creator-named personas.",
    href: "/studio/personas",
    icon: Bot,
    cta: "Open persona builder",
  },
  {
    title: "Add training inputs",
    description: "Capture tone, boundaries, example phrases, saved replies, and persona-specific style rules after secure login.",
    href: "/studio/personas",
    icon: UserRoundCog,
    cta: "Train personas",
  },
  {
    title: "Attach content packs",
    description: "Connect approved image, audio, video, script, and caption packs to the right default or custom persona.",
    href: "/studio/create",
    icon: Boxes,
    cta: "Manage packs",
  },
  {
    title: "Prepare avatar assets",
    description: "Upload digital twin references and route approved synthetic drafts into persona libraries when ready.",
    href: "/studio/create",
    icon: ImagePlus,
    cta: "Open Twinly Create",
  },
];

export function SecurePersonaSetupHub() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div
        className="rounded-3xl border border-white/10 p-5 sm:p-8"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--background) 0%, var(--background) 60%, var(--brand-tint-medium) 100%)",
          boxShadow: "var(--shadow-brand-glow-xl)",
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge variant="secondary" className="w-fit gap-2 border-white/10 bg-white/10 text-white">
              <LockKeyhole className="h-3.5 w-3.5" />
              Secure creator setup
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Build your AI persona stack after login
              </h1>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Persona creation is now part of the secure creator flow: creators can move from login into persona setup, training inputs, content packs, and avatar-ready libraries without leaving the protected studio.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Protected workflow
            </div>
            <p className="mt-2 max-w-xs text-emerald-100/80">
              Keep persona creation, custom persona setup, and content-pack assignment behind authenticated creator access.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {setupSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="border-white/10 bg-white/[0.03] shadow-none">
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-foreground">{step.title}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6">{step.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="secondary" className="w-full justify-between">
                    <Link to={step.href}>
                      {step.cta}
                      <Sparkles className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
