import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function startOfDayIso(daysAgo: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/** Aggregate analytics for the signed-in creator over the last N days (default 30). */
export const getCreatorAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { days?: number } | undefined) => ({ days: Math.min(Math.max(d?.days ?? 30, 7), 90) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const days = data.days;

    const { data: creator } = await supabase
      .from("creators")
      .select("id, handle, stage_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!creator) return null;

    const since = startOfDayIso(days - 1);

    const [gens, assets, convs, subs, tx, personas] = await Promise.all([
      supabase
        .from("generation_requests")
        .select("id, status, output_type, created_at, reviewed_at, quantity")
        .eq("creator_id", creator.id)
        .gte("created_at", since),
      supabase
        .from("content_assets")
        .select("id, asset_type, approval_status, is_synthetic, created_at")
        .eq("creator_id", creator.id)
        .gte("created_at", since),
      supabase
        .from("conversations")
        .select("id, persona_id, fan_id, started_at")
        .eq("creator_id", creator.id)
        .gte("started_at", since),
      supabase
        .from("subscriptions")
        .select("id, tier, status, started_at")
        .eq("creator_id", creator.id),
      supabase
        .from("transactions")
        .select("id, amount_cents, kind, status, created_at")
        .eq("creator_id", creator.id)
        .gte("created_at", since),
      supabase
        .from("personas")
        .select("id, display_name, slug, kind")
        .eq("creator_id", creator.id),
    ]);

    const genRows = gens.data ?? [];
    const assetRows = assets.data ?? [];
    const convRows = convs.data ?? [];
    const subRows = subs.data ?? [];
    const txRows = tx.data ?? [];
    const personaRows = personas.data ?? [];
    const personaMap = new Map(personaRows.map((p) => [p.id, p]));

    // Generation stats
    const genByStatus: Record<string, number> = {};
    const genByType: Record<string, number> = {};
    for (const g of genRows) {
      genByStatus[g.status] = (genByStatus[g.status] ?? 0) + 1;
      genByType[g.output_type] = (genByType[g.output_type] ?? 0) + 1;
    }
    const reviewed = genRows.filter((g) => g.reviewed_at);
    const approved = reviewed.filter((g) => g.status === "approved" || g.status === "published").length;
    const rejected = reviewed.filter((g) => g.status === "rejected").length;
    const approvalRate = reviewed.length ? approved / reviewed.length : null;
    // Average review latency (hours)
    const latenciesMs = reviewed
      .map((g) => new Date(g.reviewed_at!).getTime() - new Date(g.created_at).getTime())
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgReviewHours = latenciesMs.length
      ? latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length / 3_600_000
      : null;

    // Asset stats
    const syntheticAssets = assetRows.filter((a) => a.is_synthetic).length;
    const approvedAssets = assetRows.filter((a) => a.approval_status === "approved").length;

    // Engagement — conversations per day + top personas
    const dayList: string[] = [];
    for (let i = days - 1; i >= 0; i--) dayList.push(dayKey(startOfDayIso(i)));

    const chatByDay = new Map<string, number>(dayList.map((d) => [d, 0]));
    const chatByPersona = new Map<string, number>();
    const uniqueFans = new Set<string>();
    for (const c of convRows) {
      const k = dayKey(c.started_at);
      if (chatByDay.has(k)) chatByDay.set(k, (chatByDay.get(k) ?? 0) + 1);
      if (c.persona_id) chatByPersona.set(c.persona_id, (chatByPersona.get(c.persona_id) ?? 0) + 1);
      if (c.fan_id) uniqueFans.add(c.fan_id);
    }
    const topPersonas = [...chatByPersona.entries()]
      .map(([pid, n]) => ({
        personaId: pid,
        displayName: personaMap.get(pid)?.display_name ?? "Unknown",
        slug: personaMap.get(pid)?.slug ?? "",
        kind: personaMap.get(pid)?.kind ?? "ai",
        chats: n,
      }))
      .sort((a, b) => b.chats - a.chats)
      .slice(0, 5);

    // Generation per day
    const genByDay = new Map<string, number>(dayList.map((d) => [d, 0]));
    for (const g of genRows) {
      const k = dayKey(g.created_at);
      if (genByDay.has(k)) genByDay.set(k, (genByDay.get(k) ?? 0) + 1);
    }

    // Subscribers
    const activeSubs = subRows.filter((s) => s.status === "active");
    const subsByTier: Record<string, number> = {};
    for (const s of activeSubs) subsByTier[s.tier] = (subsByTier[s.tier] ?? 0) + 1;
    const newSubs = subRows.filter((s) => s.started_at && new Date(s.started_at).toISOString() >= since).length;

    // Revenue
    const successful = txRows.filter((t) => t.status === "succeeded" || t.status === "paid");
    const revenueCents = successful.reduce((a, t) => a + (t.amount_cents ?? 0), 0);
    const revenueByKind: Record<string, number> = {};
    for (const t of successful) revenueByKind[t.kind] = (revenueByKind[t.kind] ?? 0) + (t.amount_cents ?? 0);

    return {
      creator: { id: creator.id, handle: creator.handle, stageName: creator.stage_name },
      windowDays: days,
      generation: {
        total: genRows.length,
        byStatus: genByStatus,
        byType: genByType,
        approved,
        rejected,
        reviewed: reviewed.length,
        approvalRate,
        avgReviewHours,
        perDay: [...genByDay.entries()].map(([day, n]) => ({ day, count: n })),
      },
      assets: {
        total: assetRows.length,
        approved: approvedAssets,
        synthetic: syntheticAssets,
      },
      engagement: {
        chats: convRows.length,
        uniqueFans: uniqueFans.size,
        perDay: [...chatByDay.entries()].map(([day, n]) => ({ day, count: n })),
        topPersonas,
      },
      subscribers: {
        active: activeSubs.length,
        newInWindow: newSubs,
        byTier: subsByTier,
      },
      revenue: {
        totalCents: revenueCents,
        byKind: revenueByKind,
      },
    };
  });