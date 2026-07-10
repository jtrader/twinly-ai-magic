import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/session";

export function AuthPromptDialog({
  children,
  title = "Join Twinly.life to connect",
  description = "Sign up or log in to follow creators, save favorites, report content, and more.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="pointer-events-none inline-flex opacity-50">
        {children}
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const goToAuth = (mode?: "signup" | "login") => {
    const redirect =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    navigate({ to: "/auth", search: { redirect, mode } as any });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <Button onClick={() => goToAuth("signup")}>
            <UserPlus className="mr-2 size-4" />
            Join <span className="mx-0.5 font-semibold">Twinly</span>
            <span className="text-brand-foreground/80">.life</span>
          </Button>
          <Button variant="outline" onClick={() => goToAuth("login")}>
            <LogIn className="mr-2 size-4" />
            Log in
          </Button>
        </div>
        <DialogFooter className="justify-center">
          <p className="text-center text-xs text-muted-foreground">
            Free to join. 18+ only.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
