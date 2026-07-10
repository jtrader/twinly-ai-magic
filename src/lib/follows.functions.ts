import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; follow: boolean; favorite?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.follow) {
      const { error } = await supabase
        .from("creator_follows")
        .delete()
        .eq("fan_id", userId)
        .eq("creator_id", data.creatorId);
      if (error) throw new Error(error.message);
      return { following: false, favorite: false };
    }
    const { data: row, error } = await supabase
      .from("creator_follows")
      .upsert(
        { fan_id: userId, creator_id: data.creatorId, favorite: !!data.favorite },
        { onConflict: "fan_id,creator_id" },
      )
      .select("favorite")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { following: true, favorite: !!row?.favorite };
  });

export const setFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; favorite: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Upsert so favoriting also follows.
    const { data: row, error } = await supabase
      .from("creator_follows")
      .upsert(
        { fan_id: userId, creator_id: data.creatorId, favorite: data.favorite },
        { onConflict: "fan_id,creator_id" },
      )
      .select("favorite")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { following: true, favorite: !!row?.favorite };
  });

export const getFollowState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("creator_follows")
      .select("favorite")
      .eq("fan_id", context.userId)
      .eq("creator_id", data.creatorId)
      .maybeSingle();
    return { following: !!row, favorite: !!row?.favorite };
  });

export const listMyFollows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("creator_follows")
      .select("creator_id, favorite, created_at, creators:creator_id(id, handle, stage_name, bio, avatar_url, verification_status)")
      .eq("fan_id", context.userId)
      .order("favorite", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      creatorId: r.creator_id,
      favorite: !!r.favorite,
      createdAt: r.created_at,
      handle: r.creators?.handle,
      stageName: r.creators?.stage_name,
      bio: r.creators?.bio,
      avatarUrl: r.creators?.avatar_url ?? null,
      verified: r.creators?.verification_status === "verified",
    }));
  });

export const getMyFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: follows, error } = await supabase
      .from("creator_follows")
      .select("creator_id, favorite, creators:creator_id(id, handle, stage_name, verification_status)")
      .eq("fan_id", userId);
    if (error) throw new Error(error.message);
    const rows = follows ?? [];
    if (rows.length === 0) return { items: [] };

    const creatorIds = rows.map((r: any) => r.creator_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: personas } = await supabaseAdmin
      .from("personas")
      .select("id, slug, display_name, kind, disclosure_label, creator_id, visibility, is_explicit, updated_at, sort_order")
      .in("creator_id", creatorIds)
      .in("visibility", ["public", "subscribers", "vip"])
      .order("updated_at", { ascending: false })
      .limit(60);

    const byCreator = new Map(rows.map((r: any) => [r.creator_id, r]));
    const items = (personas ?? []).map((p: any) => {
      const c = byCreator.get(p.creator_id)?.creators;
      return {
        personaId: p.id,
        personaSlug: p.slug,
        displayName: p.display_name,
        kind: p.kind,
        disclosureLabel: p.disclosure_label,
        isExplicit: !!p.is_explicit,
        visibility: p.visibility,
        updatedAt: p.updated_at,
        creatorId: p.creator_id,
        handle: c?.handle,
        stageName: c?.stage_name,
        verified: c?.verification_status === "verified",
        favorite: !!byCreator.get(p.creator_id)?.favorite,
      };
    }).sort((a, b) => Number(b.favorite) - Number(a.favorite));
    return { items };
  });