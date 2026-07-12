import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

// Tiers that count as "subscriber" or higher for gating included assets.
export const SUBSCRIBER_TIERS = new Set(["base", "plus", "naughty", "wicked", "vip"]);
export const VIP_TIERS = new Set(["vip", "wicked"]);

// No payment processor is integrated yet (see AGENTS notes) — unlocks are
// recorded as `transactions.status = 'stub'`, the schema's own placeholder
// state, so the full UI/UX flow is real and demoable without pretending a
// card was actually charged. Swap the stub insert for a real charge call
// once a processor is chosen.
const UNLOCKED_STATUSES = ["stub", "succeeded"] as const;

type Access =
  | { state: "open" }
  | { state: "locked"; reason: "sign_in" | "age_gate" | "id_verification" | "subscribe" | "vip" | "ppv" | "restricted"; priceCents?: number };

function assetAccess(opts: {
  permission: "included" | "ppv" | "restricted";
  personaVisibility: "public" | "subscribers" | "vip" | string;
  isExplicit: boolean;
  priceCents: number;
  isAuthed: boolean;
  isAdult: boolean;
  idVerified: boolean;
  subTier: string | null;
  isOwner: boolean;
  purchased: boolean;
}): Access {
  if (opts.isOwner) return { state: "open" };
  if (opts.permission === "restricted") return { state: "locked", reason: "restricted" };
  if (opts.isExplicit && !opts.isAdult) return { state: "locked", reason: "age_gate" };
  // Explicit content gets an additional, un-spoofable bar beyond self-attested
  // age: real ID verification (see identity-verification.functions.ts). This
  // sits after the age_gate check so a not-yet-age-attested viewer sees the
  // simpler prompt first, not both at once.
  if (opts.isExplicit && !opts.idVerified) return { state: "locked", reason: "id_verification" };

  // invite_only doesn't additionally require a subscription tier — the
  // whole-persona invite check (getPersonaFeed) already gated the caller in;
  // per-asset restricted/ppv/age-gate rules below still apply on top of that.
  const needsSub = opts.personaVisibility === "subscribers" || opts.personaVisibility === "vip";
  const needsVip = opts.personaVisibility === "vip";

  if (needsSub && !opts.isAuthed) return { state: "locked", reason: "sign_in" };
  if (needsSub && !opts.subTier) return { state: "locked", reason: needsVip ? "vip" : "subscribe" };
  if (needsVip && !VIP_TIERS.has(opts.subTier ?? "")) return { state: "locked", reason: "vip" };
  if (needsSub && !SUBSCRIBER_TIERS.has(opts.subTier ?? "")) return { state: "locked", reason: "subscribe" };

  if (opts.permission === "ppv") {
    if (opts.purchased) return { state: "open" };
    return { state: "locked", reason: "ppv", priceCents: opts.priceCents };
  }
  return { state: "open" };
}

/** Public: fetch a persona feed. Access is computed against optional caller identity. */
export const getPersonaFeed = createServerFn({ method: "POST" })
  .validator((d: { handle: string; personaSlug: string; userId?: string | null }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("id, user_id, handle, stage_name, bio, verification_status")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!creator) return null;

    // Publish already gates on 'verified', but visibility flags on
    // already-public personas are derived/cached state that can go stale —
    // if a creator is later revoked, reads must stop immediately too, not
    // just future publishes. Owners can still preview their own content.
    const isOwnerPreCheck = !!(data.userId && data.userId === creator.user_id);
    if (!isOwnerPreCheck && creator.verification_status !== "verified") return null;

    const { data: persona } = await supabaseAdmin
      .from("personas")
      .select("id, slug, display_name, description, kind, disclosure_label, visibility, is_explicit, price_cents")
      .eq("creator_id", creator.id)
      .eq("slug", data.personaSlug)
      .maybeSingle();
    if (!persona) return null;
    if (persona.visibility === "invite_only") {
      const { checkPersonaInviteAccess } = await import("./persona-invites.functions");
      const invited = isOwnerPreCheck ? true : await checkPersonaInviteAccess(supabaseAdmin, persona.id, data.userId ?? null);
      if (!invited) return null;
    } else if (!["public", "subscribers", "vip"].includes(persona.visibility as string)) {
      return null;
    }

    // Assets attached to this persona directly, plus everything the creator
    // has marked shared across all their personas (a "Global" folder).
    const { data: perms } = await supabaseAdmin
      .from("persona_content_permissions")
      .select("asset_id, permission_type")
      .eq("persona_id", persona.id);
    const permMap = new Map<string, "included" | "ppv" | "restricted">();
    for (const p of perms ?? []) permMap.set(p.asset_id, p.permission_type as any);

    const { data: sharedAssets } = await supabaseAdmin
      .from("content_assets")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("shared_across_personas", true);
    for (const s of sharedAssets ?? []) if (!permMap.has(s.id)) permMap.set(s.id, "included");

    const assetIds = Array.from(permMap.keys());

    let assets: any[] = [];
    if (assetIds.length) {
      const { data: a } = await supabaseAdmin
        .from("content_assets")
        .select("id, title, asset_type, storage_path, external_url, is_synthetic, ai_generated_label, ai_disclosure_required, price_cents, tags, created_at, approval_status, moderation_status, visibility, internal_label")
        .in("id", assetIds)
        .eq("approval_status", "approved")
        .neq("moderation_status", "removed")
        .neq("internal_label", "do_not_use")
        .neq("internal_label", "restricted")
        .neq("visibility", "private");
      assets = a ?? [];
    }

    // Caller context.
    const isOwner = !!(data.userId && data.userId === creator.user_id);
    let isAuthed = !!data.userId;
    let isAdult = false;
    let idVerified = false;
    let subTier: string | null = null;

    if (data.userId) {
      const [{ data: prof }, { data: sub }] = await Promise.all([
        supabaseAdmin.from("profiles").select("age_verified_at, id_verified_at").eq("id", data.userId).maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("fan_id", data.userId)
          .eq("creator_id", creator.id)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      isAdult = !!prof?.age_verified_at;
      idVerified = !!(prof as any)?.id_verified_at;
      const stillValid = sub?.current_period_end ? new Date(sub.current_period_end).getTime() > Date.now() : true;
      if (sub && stillValid) subTier = sub.tier as string;
    }

    let purchasedAssetIds = new Set<string>();
    if (data.userId && assetIds.length) {
      const { data: purchases } = await supabaseAdmin
        .from("transactions")
        .select("asset_id")
        .eq("fan_id", data.userId)
        .in("asset_id", assetIds)
        .in("status", UNLOCKED_STATUSES as any);
      purchasedAssetIds = new Set((purchases ?? []).map((p: any) => p.asset_id));
    }

    const items = assets
      .map((a) => {
        const permission = permMap.get(a.id) ?? "included";
        const access = assetAccess({
          permission,
          personaVisibility: persona.visibility as any,
          isExplicit: !!persona.is_explicit,
          priceCents: a.price_cents ?? 0,
          isAuthed,
          isAdult,
          idVerified,
          subTier,
          isOwner,
          purchased: purchasedAssetIds.has(a.id),
        });
        return {
          id: a.id,
          title: a.title,
          assetType: a.asset_type as "image" | "video" | "audio" | "text",
          isSynthetic: !!a.is_synthetic,
          aiDisclosureRequired: !!a.ai_disclosure_required,
          aiGeneratedLabel: !!a.ai_generated_label,
          priceCents: a.price_cents ?? 0,
          tags: (a.tags ?? []) as string[],
          createdAt: a.created_at,
          hasMedia: !!(a.storage_path || a.external_url),
          externalUrl: access.state === "open" ? a.external_url ?? null : null,
          permission,
          access,
        };
      })
      .filter((it) => it.access.state !== "locked" || (it.access as any).reason !== "restricted")
      .sort((a, b) => (a.access.state === b.access.state ? 0 : a.access.state === "open" ? -1 : 1));

    return {
      creator: {
        id: creator.id,
        handle: creator.handle,
        stageName: creator.stage_name,
        bio: creator.bio,
        verified: creator.verification_status === "verified",
      },
      persona: {
        id: persona.id,
        slug: persona.slug,
        displayName: persona.display_name,
        description: persona.description,
        kind: persona.kind as "real_me" | "ai",
        disclosureLabel: persona.disclosure_label,
        visibility: persona.visibility as "public" | "subscribers" | "vip",
        isExplicit: !!persona.is_explicit,
        priceCents: persona.price_cents ?? 0,
      },
      viewer: { isAuthed, isAdult, idVerified, subTier, isOwner },
      items,
    };
  });

/** Authenticated: mint a short-lived signed URL for an asset the fan has access to. */
export const getFanAssetUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { assetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: asset } = await supabaseAdmin
      .from("content_assets")
      .select("id, creator_id, storage_path, approval_status, moderation_status, internal_label, visibility, shared_across_personas")
      .eq("id", data.assetId)
      .maybeSingle();
    if (!asset || !asset.storage_path) throw new Error("Asset not available");
    if (asset.approval_status !== "approved") throw new Error("Asset not approved");
    if (asset.moderation_status === "removed") throw new Error("Asset unavailable");
    if (asset.internal_label === "do_not_use" || asset.internal_label === "restricted") {
      throw new Error("Asset unavailable");
    }

    const { data: creator } = await supabaseAdmin
      .from("creators").select("user_id, verification_status").eq("id", asset.creator_id).maybeSingle();
    const isOwner = creator?.user_id === context.userId;

    if (!isOwner) {
      // Same revocation defense-in-depth as getPersonaFeed — a signed URL
      // must not be mintable for a creator who's since been revoked, even
      // if the asset/permission rows themselves haven't changed.
      if (creator?.verification_status !== "verified") throw new Error("Creator not verified");
      // Must have at least one persona link that isn't restricted, and be subscribed if persona requires it.
      let candidates: any[];
      if (asset.shared_across_personas) {
        // Globally-shared assets have no direct link — qualify against any
        // of the creator's fan-facing personas, least restrictive first.
        const { data: personas } = await supabaseAdmin
          .from("personas").select("visibility, is_explicit")
          .eq("creator_id", asset.creator_id)
          .in("visibility", ["public", "subscribers", "vip"]);
        candidates = (personas ?? [])
          .sort((a: any, b: any) => (a.visibility === "public" ? -1 : 1) - (b.visibility === "public" ? -1 : 1))
          .map((p: any) => ({ permission_type: "included", personas: p }));
      } else {
        const { data: perm } = await supabaseAdmin
          .from("persona_content_permissions")
          .select("permission_type, persona_id, personas:persona_id(visibility, is_explicit)")
          .eq("asset_id", asset.id);
        candidates = perm ?? [];
      }
      const active = candidates.find((p: any) =>
        p.permission_type !== "restricted" &&
        p.personas && ["public", "subscribers", "vip"].includes(p.personas.visibility)
      ) as any;
      if (!active) throw new Error("Not permitted");

      const personaVis = active.personas.visibility as "public" | "subscribers" | "vip";
      const needsSub = personaVis !== "public";
      const needsVip = personaVis === "vip";

      if (active.personas.is_explicit) {
        const { data: prof } = await supabaseAdmin
          .from("profiles").select("age_verified_at").eq("id", context.userId).maybeSingle();
        if (!prof?.age_verified_at) throw new Error("Age verification required");
      }
      if (needsSub) {
        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("fan_id", context.userId)
          .eq("creator_id", asset.creator_id)
          .eq("status", "active")
          .maybeSingle();
        const validUntil = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : Infinity;
        if (!sub || validUntil < Date.now()) throw new Error("Subscription required");
        const tier = sub.tier as string;
        if (needsVip && !VIP_TIERS.has(tier)) throw new Error("VIP required");
        if (!SUBSCRIBER_TIERS.has(tier)) throw new Error("Subscription required");
      }
      if (active.permission_type === "ppv") {
        const { data: purchase } = await supabaseAdmin
          .from("transactions")
          .select("id")
          .eq("fan_id", context.userId).eq("asset_id", asset.id)
          .in("status", UNLOCKED_STATUSES as any)
          .maybeSingle();
        if (!purchase) throw new Error("Purchase required");
      }
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("content-assets")
      .createSignedUrl(asset.storage_path, 600);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl };
  });

/**
 * Records intent to unlock a pay-per-view asset. No payment processor is
 * integrated — this inserts a `transactions` row with status 'stub' (the
 * schema's own placeholder state), which `assetAccess`/`getFanAssetUrl`
 * already treat as unlocked. Swap this for a real charge-then-insert once a
 * processor is wired; the rest of the unlock flow doesn't need to change.
 */
export const unlockAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { assetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: asset } = await supabaseAdmin
      .from("content_assets")
      .select("id, creator_id, price_cents, approval_status, moderation_status, internal_label")
      .eq("id", data.assetId)
      .maybeSingle();
    if (!asset) throw new Error("Asset not found");
    if (asset.approval_status !== "approved") throw new Error("Asset not available");
    if (asset.moderation_status === "removed") throw new Error("Asset unavailable");

    const { data: perms } = await supabaseAdmin
      .from("persona_content_permissions")
      .select("permission_type, personas:persona_id(visibility)")
      .eq("asset_id", asset.id);
    const ppvEligible = (perms ?? []).some((p: any) =>
      p.permission_type === "ppv" && p.personas && ["public", "subscribers", "vip"].includes(p.personas.visibility));
    if (!ppvEligible) throw new Error("This item isn't available for pay-per-view unlock.");

    const { data: existing } = await supabaseAdmin
      .from("transactions")
      .select("id, amount_cents")
      .eq("fan_id", userId).eq("asset_id", asset.id)
      .in("status", UNLOCKED_STATUSES as any)
      .maybeSingle();
    if (existing) return { ok: true, alreadyUnlocked: true, amountCents: existing.amount_cents };

    const amountCents = Math.max(0, asset.price_cents ?? 0);
    const { data: tx, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        fan_id: userId,
        creator_id: asset.creator_id,
        asset_id: asset.id,
        amount_cents: amountCents,
        kind: "ppv",
        status: "stub",
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    await logAudit(userId, "asset.unlocked_demo", { type: "asset", id: asset.id }, { amountCents, status: "stub" });
    return { ok: true, alreadyUnlocked: false, amountCents, transactionId: tx.id, unlockedAt: tx.created_at };
  });

/** Fan-facing: everything this fan has unlocked (optionally scoped to one creator), for the vault/history view and spend indicator. */
export const listMyUnlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("transactions")
      .select("id, asset_id, creator_id, amount_cents, status, created_at")
      .eq("fan_id", context.userId)
      .eq("kind", "ppv")
      .in("status", UNLOCKED_STATUSES as any)
      .not("asset_id", "is", null)
      .order("created_at", { ascending: false });
    if (data.creatorId) q = q.eq("creator_id", data.creatorId);
    const { data: txs, error } = await q;
    if (error) throw error;
    if (!txs || txs.length === 0) return { unlocks: [] };

    const assetIds = [...new Set(txs.map((t: any) => t.asset_id))];
    const creatorIds = [...new Set(txs.map((t: any) => t.creator_id))];
    const [{ data: assets }, { data: creators }] = await Promise.all([
      supabaseAdmin.from("content_assets").select("id, title, asset_type, approval_status").in("id", assetIds),
      supabaseAdmin.from("creators").select("id, handle, stage_name").in("id", creatorIds),
    ]);
    const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a]));
    const creatorMap = new Map((creators ?? []).map((c: any) => [c.id, c]));

    return {
      unlocks: txs
        .map((t: any) => ({
          transactionId: t.id,
          amountCents: t.amount_cents,
          status: t.status,
          unlockedAt: t.created_at,
          asset: assetMap.get(t.asset_id) ?? null,
          creator: creatorMap.get(t.creator_id) ?? null,
        }))
        .filter((u: any) => u.asset && u.asset.approval_status === "approved"),
    };
  });

/**
 * Vault widening: content the fan can currently see via an ACTIVE
 * subscription (permission_type='included'), distinct from PPV purchases in
 * `listMyUnlocks`. Access is live, not a permanent record — items drop out
 * here if the subscription lapses, unlike a real unlock which is forever.
 */
export const listMySubscriptionContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("creator_id, tier, status, current_period_end")
      .eq("fan_id", context.userId)
      .eq("status", "active");
    const activeSubs = (subs ?? []).filter((s: any) =>
      !s.current_period_end || new Date(s.current_period_end).getTime() > Date.now());
    if (activeSubs.length === 0) return { items: [] };

    const results: any[] = [];
    for (const sub of activeSubs) {
      const isVip = VIP_TIERS.has(sub.tier);
      const visibilities: ("subscribers" | "vip")[] = isVip ? ["subscribers", "vip"] : ["subscribers"];
      const { data: personas } = await supabaseAdmin
        .from("personas")
        .select("id, display_name, slug, visibility")
        .eq("creator_id", sub.creator_id)
        .in("visibility", visibilities);
      const personaIds = (personas ?? []).map((p: any) => p.id);
      if (!personaIds.length) continue;

      const { data: perms } = await supabaseAdmin
        .from("persona_content_permissions")
        .select("asset_id, persona_id")
        .in("persona_id", personaIds)
        .eq("permission_type", "included");
      const assetIds = [...new Set((perms ?? []).map((p: any) => p.asset_id))];
      if (!assetIds.length) continue;

      const { data: assets } = await supabaseAdmin
        .from("content_assets")
        .select("id, title, asset_type, approval_status")
        .in("id", assetIds)
        .eq("approval_status", "approved")
        .neq("visibility", "private");
      const { data: creator } = await supabaseAdmin
        .from("creators").select("id, handle, stage_name").eq("id", sub.creator_id).maybeSingle();
      const personaMap = new Map((personas ?? []).map((p: any) => [p.id, p]));

      for (const a of assets ?? []) {
        const link = (perms ?? []).find((p: any) => p.asset_id === a.id);
        results.push({
          asset: a,
          creator: creator ?? null,
          persona: link ? personaMap.get(link.persona_id) ?? null : null,
          tier: sub.tier,
        });
      }
    }
    return { items: results };
  });