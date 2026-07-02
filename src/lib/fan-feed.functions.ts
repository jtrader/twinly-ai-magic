import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tiers that count as "subscriber" or higher for gating included assets.
const SUBSCRIBER_TIERS = new Set(["base", "plus", "naughty", "wicked", "vip"]);
const VIP_TIERS = new Set(["vip", "wicked"]);

type Access =
  | { state: "open" }
  | { state: "locked"; reason: "sign_in" | "age_gate" | "subscribe" | "vip" | "ppv" | "restricted"; priceCents?: number };

function assetAccess(opts: {
  permission: "included" | "ppv" | "restricted";
  personaVisibility: "public" | "subscribers" | "vip" | string;
  isExplicit: boolean;
  priceCents: number;
  isAuthed: boolean;
  isAdult: boolean;
  subTier: string | null;
  isOwner: boolean;
}): Access {
  if (opts.isOwner) return { state: "open" };
  if (opts.permission === "restricted") return { state: "locked", reason: "restricted" };
  if (opts.isExplicit && !opts.isAdult) return { state: "locked", reason: "age_gate" };

  const needsSub = opts.personaVisibility !== "public";
  const needsVip = opts.personaVisibility === "vip";

  if (needsSub && !opts.isAuthed) return { state: "locked", reason: "sign_in" };
  if (needsSub && !opts.subTier) return { state: "locked", reason: needsVip ? "vip" : "subscribe" };
  if (needsVip && !VIP_TIERS.has(opts.subTier ?? "")) return { state: "locked", reason: "vip" };
  if (needsSub && !SUBSCRIBER_TIERS.has(opts.subTier ?? "")) return { state: "locked", reason: "subscribe" };

  if (opts.permission === "ppv") {
    // MVP: PPV is locked until unlock flow is wired.
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

    const { data: persona } = await supabaseAdmin
      .from("personas")
      .select("id, slug, display_name, description, kind, disclosure_label, visibility, is_explicit, price_cents")
      .eq("creator_id", creator.id)
      .eq("slug", data.personaSlug)
      .maybeSingle();
    if (!persona) return null;
    if (!["public", "subscribers", "vip"].includes(persona.visibility as string)) return null;

    // Assets attached to this persona.
    const { data: perms } = await supabaseAdmin
      .from("persona_content_permissions")
      .select("asset_id, permission_type")
      .eq("persona_id", persona.id);
    const permMap = new Map<string, "included" | "ppv" | "restricted">();
    for (const p of perms ?? []) permMap.set(p.asset_id, p.permission_type as any);
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
    let subTier: string | null = null;

    if (data.userId) {
      const [{ data: prof }, { data: sub }] = await Promise.all([
        supabaseAdmin.from("profiles").select("age_verified_at").eq("id", data.userId).maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("fan_id", data.userId)
          .eq("creator_id", creator.id)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      isAdult = !!prof?.age_verified_at;
      const stillValid = sub?.current_period_end ? new Date(sub.current_period_end).getTime() > Date.now() : true;
      if (sub && stillValid) subTier = sub.tier as string;
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
          subTier,
          isOwner,
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
      viewer: { isAuthed, isAdult, subTier, isOwner },
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
      .select("id, creator_id, storage_path, approval_status, moderation_status, internal_label, visibility")
      .eq("id", data.assetId)
      .maybeSingle();
    if (!asset || !asset.storage_path) throw new Error("Asset not available");
    if (asset.approval_status !== "approved") throw new Error("Asset not approved");
    if (asset.moderation_status === "removed") throw new Error("Asset unavailable");
    if (asset.internal_label === "do_not_use" || asset.internal_label === "restricted") {
      throw new Error("Asset unavailable");
    }

    const { data: creator } = await supabaseAdmin
      .from("creators").select("user_id").eq("id", asset.creator_id).maybeSingle();
    const isOwner = creator?.user_id === context.userId;

    if (!isOwner) {
      // Must have at least one persona link that isn't restricted, and be subscribed if persona requires it.
      const { data: perm } = await supabaseAdmin
        .from("persona_content_permissions")
        .select("permission_type, persona_id, personas:persona_id(visibility, is_explicit)")
        .eq("asset_id", asset.id);
      const active = (perm ?? []).find((p: any) =>
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
      if (active.permission_type === "ppv") throw new Error("Purchase required");
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("content-assets")
      .createSignedUrl(asset.storage_path, 600);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign URL");
    return { url: signed.signedUrl };
  });