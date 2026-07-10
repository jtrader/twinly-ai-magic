import { cn } from "@/lib/utils";

export function TwinlyWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline", className)}>
      Twinly<span className="text-brand-glow">.life</span>
    </span>
  );
}
