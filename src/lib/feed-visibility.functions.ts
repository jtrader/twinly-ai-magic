import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type FeedVisibilityTier,
  type ManagerRole,
  PLATFORM_DEFAULT_TIER,
  canViewerSeeTier,
  creatorIdForPersona,
  creatorIdForPost,
  requireFeedManagerRole,
  resolveFeedItemVisibility,
  writeFeedVisibilityAudit,
} from "./feed-visibility-access.server";

const TIERS: FeedVisibilityTier[] = ["public", "logged_in", "subscribers_only"];
function assertTier(v: unknown): FeedVisibilityTier {
  if (!TIERS.includes(v as FeedVisibilityTier)) throw new Error("Invalid visibility tier");
  return v as FeedVisibilityTier;
}

/**
 * What the caller can manage: which creators (own / agency-managed / all if
 * admin), each with their personas, for driving the settings-screen picker.
 * Returns role: null for callers with no feed-management access at all
 * (supporters/fans) — the UI must treat that as access denied, and every
 * mutating endpoint below rejects them regardless of what the UI shows.
 */
export const listMyFeedVisibilityScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });

    let creators: any[] = [];
    if (isAdmin) {
      const { data } = await supabaseAdmin.from("creators").select("id, handle, stage_name").order("stage_name");
      creators = (data ?? []).map((c: any) => ({ ...c, viaRole: "admin" as ManagerRole }));
    } else {
      const [{ data: owned }, { data: agencyLinks }] = await Promise.all([
        supabaseAdmin.from("creators").select("id, handle, stage_name").eq("user_id", userId),
        supabaseAdmin
          .from("agency_creators")
          .select("creator_id, agencies:agency_id(owner_user_id), creators:creator_id(id, handle, stage_name)")
          .order("creator_id"),
      ]);
      const ownedRows = (owned ?? []).map((c: any) => ({ ...c, viaRole: "creator" as ManagerRole }));
      const managedRows = (agencyLinks ?? [])
        .filter((l: any) => l.agencies?.owner_user_id === userId)
        .map((l: any) => ({ ...l.creators, viaRole: "agency" as ManagerRole }));
      creators = [...ownedRows, ...managedRows];
    }

    if (creators.length === 0) return { role: null as ManagerRole | null, creators: [] };

    const creatorIds = creators.map((c) => c.id);
    const { data: personas } = await supabaseAdmin
      .from("personas")
      .select("id, creator_id, slug, display_name")
      .in("creator_id", creatorIds)
      .order("sort_order", { ascending: true });
    const personasByCreator = new Map<string, any[]>();
    for (const p of personas ?? []) {
      const list = personasByCreator.get(p.creator_id) ?? [];
      list.push({ id: p.id, slug: p.slug, displayName: p.display_name });
      personasByCreator.set(p.creator_id, list);
    }

    return {
      role: isAdmin ? "admin" as ManagerRole : (creators[0]?.viaRole ?? null),
      creators: creators.map((c) => ({
        id: c.id,
        handle: c.handle,
        stageName: c.stage_name,
        viaRole: c.viaRole,
        personas: personasByCreator.get(c.id) ?? [],
      })),
    };
  });

export const getPersonaVisibilityPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const creatorId = await creatorIdForPersona(supabaseAdmin, data.personaId);
    await requireFeedManagerRole(supabaseAdmin, context.userId, creatorId);

    const { data: policy } = await supabaseAdmin
      .from("feed_visibility_policies")
      .select("default_visibility, updated_at, updated_by")
      .eq("persona_id", data.personaId)
      .maybeSingle();
    return {
      defaultVisibility: (policy?.default_visibility ?? PLATFORM_DEFAULT_TIER) as FeedVisibilityTier,
      isExplicitlySet: !!policy,
      updatedAt: policy?.updated_at ?? null,
    };
  });

export const setPersonaDefaultVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string; defaultVisibility: string }) => ({ ...d, defaultVisibility: assertTier(d.defaultVisibility) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const creatorId = await creatorIdForPersona(supabaseAdmin, data.personaId);
    const role = await requireFeedManagerRole(supabaseAdmin, context.userId, creatorId);

    const { data: before } = await supabaseAdmin
      .from("feed_visibility_policies")
      .select("default_visibility")
      .eq("persona_id", data.personaId)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("feed_visibility_policies")
      .upsert(
        { persona_id: data.personaId, default_visibility: data.defaultVisibility, updated_by: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "persona_id" },
      )
      .select("default_visibility, updated_at")
      .single();
    if (error) throw error;

    await writeFeedVisibilityAudit(supabaseAdmin, {
      actorId: context.userId,
      actorRole: role,
      targetType: "persona_default",
      targetId: data.personaId,
      beforeValue: { defaultVisibility: before?.default_visibility ?? PLATFORM_DEFAULT_TIER },
      afterValue: { defaultVisibility: row.default_visibility },
    });

    return { defaultVisibility: row.default_visibility as FeedVisibilityTier, updatedAt: row.updated_at };
  });

/** Curation list for one creator's feed: resolved visibility + override indicator per post. */
export const listFeedItemsForCuration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; personaId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFeedManagerRole(supabaseAdmin, context.userId, data.creatorId);

    let q = supabaseAdmin
      .from("creator_posts")
      .select("id, body, image_url, created_at, linked_persona_id, is_removed")
      .eq("creator_id", data.creatorId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.personaId) q = q.eq("linked_persona_id", data.personaId);
    const { data: posts, error } = await q;
    if (error) throw error;

    const postIds = (posts ?? []).map((p: any) => p.id);
    const personaIds = [...new Set((posts ?? []).map((p: any) => p.linked_persona_id).filter(Boolean))];

    const [{ data: overrides }, { data: policies }] = await Promise.all([
      postIds.length
        ? supabaseAdmin.from("feed_item_visibility_overrides").select("feed_post_id, visibility").in("feed_post_id", postIds)
        : Promise.resolve({ data: [] }),
      personaIds.length
        ? supabaseAdmin.from("feed_visibility_policies").select("persona_id, default_visibility").in("persona_id", personaIds)
        : Promise.resolve({ data: [] }),
    ]);
    const overrideMap = new Map((overrides ?? []).map((o: any) => [o.feed_post_id, o.visibility]));
    const policyMap = new Map((policies ?? []).map((p: any) => [p.persona_id, p.default_visibility]));

    return {
      items: (posts ?? []).map((p: any) => {
        const overrideTier = overrideMap.get(p.id) ?? null;
        const personaDefaultTier = p.linked_persona_id ? policyMap.get(p.linked_persona_id) ?? null : null;
        const resolved = resolveFeedItemVisibility({ overrideTier, personaDefaultTier });
        return {
          id: p.id,
          body: p.body,
          imageUrl: p.image_url,
          createdAt: p.created_at,
          linkedPersonaId: p.linked_persona_id,
          isRemoved: p.is_removed,
          resolvedVisibility: resolved,
          hasOverride: !!overrideTier,
          overrideTier,
        };
      }),
    };
  });

export const setFeedItemVisibilityOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; visibility: string }) => ({ ...d, visibility: assertTier(d.visibility) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const creatorId = await creatorIdForPost(supabaseAdmin, data.postId);
    const role = await requireFeedManagerRole(supabaseAdmin, context.userId, creatorId);

    const { data: before } = await supabaseAdmin
      .from("feed_item_visibility_overrides")
      .select("visibility")
      .eq("feed_post_id", data.postId)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("feed_item_visibility_overrides")
      .upsert(
        { feed_post_id: data.postId, visibility: data.visibility, overrides_default: true, updated_by: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "feed_post_id" },
      )
      .select("visibility, updated_at")
      .single();
    if (error) throw error;

    await writeFeedVisibilityAudit(supabaseAdmin, {
      actorId: context.userId,
      actorRole: role,
      targetType: "feed_item_override",
      targetId: data.postId,
      beforeValue: { overrideTier: before?.visibility ?? null },
      afterValue: { overrideTier: row.visibility },
    });

    return { visibility: row.visibility as FeedVisibilityTier, updatedAt: row.updated_at };
  });

export const clearFeedItemVisibilityOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const creatorId = await creatorIdForPost(supabaseAdmin, data.postId);
    const role = await requireFeedManagerRole(supabaseAdmin, context.userId, creatorId);

    const { data: before } = await supabaseAdmin
      .from("feed_item_visibility_overrides")
      .select("visibility")
      .eq("feed_post_id", data.postId)
      .maybeSingle();
    if (!before) return { ok: true, cleared: false };

    const { error } = await supabaseAdmin.from("feed_item_visibility_overrides").delete().eq("feed_post_id", data.postId);
    if (error) throw error;

    await writeFeedVisibilityAudit(supabaseAdmin, {
      actorId: context.userId,
      actorRole: role,
      targetType: "feed_item_override",
      targetId: data.postId,
      beforeValue: { overrideTier: before.visibility },
      afterValue: { overrideTier: null },
    });

    return { ok: true, cleared: true };
  });

/** Bulk action: applies to multiple posts within a single creator's scope, one audit entry per item. */
export const bulkSetFeedItemVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; postIds: string[]; visibility: string }) => ({ ...d, visibility: assertTier(d.visibility) }))
  .handler(async ({ data, context }) => {
    if (!data.postIds.length) return { updated: 0 };
    if (data.postIds.length > 200) throw new Error("Too many items in one bulk action (max 200).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const role = await requireFeedManagerRole(supabaseAdmin, context.userId, data.creatorId);

    // Every post must actually belong to this creator — a caller can't sneak
    // another creator's post into a batch they're authorized for.
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from("creator_posts")
      .select("id")
      .eq("creator_id", data.creatorId)
      .in("id", data.postIds);
    if (ownErr) throw ownErr;
    const ownedIds = new Set((owned ?? []).map((p: any) => p.id));
    const targetIds = data.postIds.filter((id) => ownedIds.has(id));

    const { data: existing } = await supabaseAdmin
      .from("feed_item_visibility_overrides")
      .select("feed_post_id, visibility")
      .in("feed_post_id", targetIds);
    const beforeMap = new Map((existing ?? []).map((o: any) => [o.feed_post_id, o.visibility]));

    let updated = 0;
    for (const postId of targetIds) {
      const { error } = await supabaseAdmin
        .from("feed_item_visibility_overrides")
        .upsert(
          { feed_post_id: postId, visibility: data.visibility, overrides_default: true, updated_by: context.userId, updated_at: new Date().toISOString() },
          { onConflict: "feed_post_id" },
        );
      if (error) throw error;
      await writeFeedVisibilityAudit(supabaseAdmin, {
        actorId: context.userId,
        actorRole: role,
        targetType: "feed_item_override",
        targetId: postId,
        beforeValue: { overrideTier: beforeMap.get(postId) ?? null },
        afterValue: { overrideTier: data.visibility },
      });
      updated += 1;
    }
    return { updated, skipped: data.postIds.length - targetIds.length };
  });

/** Per-tier preview: what a public visitor / logged-in fan / paying subscriber would see, right now. */
export const previewFeedForTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; tier: "public" | "logged_in" | "subscribers_only" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireFeedManagerRole(supabaseAdmin, context.userId, data.creatorId);

    const viewer =
      data.tier === "subscribers_only"
        ? { isAuthed: true, isPayingSubscriber: true }
        : data.tier === "logged_in"
          ? { isAuthed: true, isPayingSubscriber: false }
          : { isAuthed: false, isPayingSubscriber: false };

    const { data: posts, error } = await supabaseAdmin
      .from("creator_posts")
      .select("id, body, image_url, created_at, linked_persona_id")
      .eq("creator_id", data.creatorId)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const postIds = (posts ?? []).map((p: any) => p.id);
    const personaIds = [...new Set((posts ?? []).map((p: any) => p.linked_persona_id).filter(Boolean))];
    const [{ data: overrides }, { data: policies }] = await Promise.all([
      postIds.length
        ? supabaseAdmin.from("feed_item_visibility_overrides").select("feed_post_id, visibility").in("feed_post_id", postIds)
        : Promise.resolve({ data: [] }),
      personaIds.length
        ? supabaseAdmin.from("feed_visibility_policies").select("persona_id, default_visibility").in("persona_id", personaIds)
        : Promise.resolve({ data: [] }),
    ]);
    const overrideMap = new Map((overrides ?? []).map((o: any) => [o.feed_post_id, o.visibility]));
    const policyMap = new Map((policies ?? []).map((p: any) => [p.persona_id, p.default_visibility]));

    const items = (posts ?? [])
      .map((p: any) => {
        const resolved = resolveFeedItemVisibility({
          overrideTier: overrideMap.get(p.id) ?? null,
          personaDefaultTier: p.linked_persona_id ? policyMap.get(p.linked_persona_id) ?? null : null,
        });
        return { id: p.id, body: p.body, imageUrl: p.image_url, createdAt: p.created_at, resolvedVisibility: resolved };
      })
      .filter((p: any) => canViewerSeeTier(p.resolvedVisibility, viewer));

    return { tier: data.tier, items };
  });

/** Audit log, scoped per RBAC: admin sees all (optionally filtered), creator/agency see only their own/managed scope. */
export const listFeedVisibilityAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const limit = Math.min(data.limit ?? 100, 300);

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });

    let creatorIds: string[];
    if (isAdmin && !data.creatorId) {
      creatorIds = [];
    } else if (data.creatorId) {
      await requireFeedManagerRole(supabaseAdmin, userId, data.creatorId);
      creatorIds = [data.creatorId];
    } else {
      const [{ data: owned }, { data: agencyLinks }] = await Promise.all([
        supabaseAdmin.from("creators").select("id").eq("user_id", userId),
        supabaseAdmin
          .from("agency_creators")
          .select("creator_id, agencies:agency_id(owner_user_id)"),
      ]);
      const managed = (agencyLinks ?? [])
        .filter((l: any) => l.agencies?.owner_user_id === userId)
        .map((l: any) => l.creator_id);
      creatorIds = [...new Set([...(owned ?? []).map((c: any) => c.id), ...managed])];
      if (creatorIds.length === 0) return { entries: [] };
    }

    let personaIds: string[] = [];
    let postIds: string[] = [];
    if (creatorIds.length) {
      const [{ data: personas }, { data: posts }] = await Promise.all([
        supabaseAdmin.from("personas").select("id").in("creator_id", creatorIds),
        supabaseAdmin.from("creator_posts").select("id").in("creator_id", creatorIds),
      ]);
      personaIds = (personas ?? []).map((p: any) => p.id);
      postIds = (posts ?? []).map((p: any) => p.id);
    }

    let query = supabaseAdmin
      .from("feed_visibility_audit_log")
      .select("id, actor_id, actor_role, target_type, target_id, before_value, after_value, changed_at")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (creatorIds.length) {
      const personaFilter = personaIds.length ? personaIds : ["00000000-0000-0000-0000-000000000000"];
      const postFilter = postIds.length ? postIds : ["00000000-0000-0000-0000-000000000000"];
      query = query.or(
        `and(target_type.eq.persona_default,target_id.in.(${personaFilter.join(",")})),and(target_type.eq.feed_item_override,target_id.in.(${postFilter.join(",")}))`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const actorIds = [...new Set((rows ?? []).map((r: any) => r.actor_id))];
    const { data: actors } = actorIds.length
      ? await supabaseAdmin.from("profiles_public" as any).select("id, display_name").in("id", actorIds)
      : { data: [] as any[] };
    const actorMap = new Map((actors ?? []).map((a: any) => [a.id, a.display_name]));

    return {
      entries: (rows ?? []).map((r: any) => ({
        id: r.id,
        actorId: r.actor_id,
        actorName: actorMap.get(r.actor_id) ?? "Unknown",
        actorRole: r.actor_role,
        targetType: r.target_type,
        targetId: r.target_id,
        beforeValue: r.before_value,
        afterValue: r.after_value,
        changedAt: r.changed_at,
      })),
    };
  });
