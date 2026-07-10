import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/twinly/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { listMyCreatorPricing, upsertCreatorPrice, type Tier } from "@/lib/creator-pricing.functions";

export const Route = createFileRoute("/studio/pricing")({
  component: PricingPage,
  head: () => ({ meta: [{ title: "Pricing — Creator studio" }, { name: "robots", content: "noindex" }] }),
});

const TIERS: { id: Tier; label: string; blurb: string }[] = [
  { id: "base", label: "Base", blurb: "Entry-level access." },
  { id: "plus", label: "Plus", blurb: "Standard subscription." },
  { id: "vip", label: "VIP", blurb: "Top tier, priority access." },
];

type Row = { tier: Tier; amountDollars: string; active: boolean };

function PricingPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(TIERS.map((t) => ({ tier: t.id, amountDollars: "", active: true })));
  const [busy, setBusy] = useState<Tier | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const list = useServerFn(listMyCreatorPricing);
  const save = useServerFn(upsertCreatorPrice);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle();
      if (!c) { setLoadingList(false); return; }
      setCreatorId((c as any).id);
      const existing = await list({ data: { creatorId: (c as any).id } });
      setRows(TIERS.map((t) => {
        const found = existing.find((e) => e.tier === t.id);
        return {
          tier: t.id,
          amountDollars: found ? (found.amountCents / 100).toFixed(2) : "",
          active: found?.active ?? true,
        };
      }));
      setLoadingList(false);
    })();
  }, [user, list]);

  async function handleSave(tier: Tier) {
    if (!creatorId) return;
    const row = rows.find((r) => r.tier === tier)!;
    const cents = Math.round(parseFloat(row.amountDollars) * 100);
    if (!Number.isFinite(cents) || cents < 50) { toast.error("Minimum $0.50/month"); return; }
    setBusy(tier);
    try {
      await save({ data: { creatorId, tier, amountCents: cents, active: row.active } });
      toast.success(`${tier.toUpperCase()} tier saved`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Creator studio</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Subscription pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set your monthly price for each tier. Fans pay you directly.</p>
      </header>

      {loadingList && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loadingList && !creatorId && (
        <p className="text-sm text-muted-foreground">Complete onboarding to configure pricing.</p>
      )}

      {!loadingList && creatorId && (
        <div className="space-y-3">
          {rows.map((row) => {
            const meta = TIERS.find((t) => t.id === row.tier)!;
            return (
              <div key={row.tier} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">{meta.blurb}</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Active
                    <Switch
                      checked={row.active}
                      onCheckedChange={(v) => setRows((s) => s.map((r) => r.tier === row.tier ? { ...r, active: v } : r))}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[10rem]">
                    <Label htmlFor={`price-${row.tier}`} className="text-xs">Monthly price (USD)</Label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <Input
                        id={`price-${row.tier}`}
                        inputMode="decimal"
                        placeholder="9.99"
                        value={row.amountDollars}
                        onChange={(e) => setRows((s) => s.map((r) => r.tier === row.tier ? { ...r, amountDollars: e.target.value } : r))}
                        className="pl-6"
                      />
                    </div>
                  </div>
                  <Button onClick={() => handleSave(row.tier)} disabled={busy === row.tier}>
                    {busy === row.tier ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Existing subscribers keep their current price. Changes apply to new subscriptions only.
          </p>
        </div>
      )}
    </AppShell>
  );
}