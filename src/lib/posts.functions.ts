import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function serverPublic() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

async function signImageUrl(client: ReturnType<typeof serverPublic>, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data } = await client.storage.from("post-media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

type FeedPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
  creator: { id: string; handle: string; stageName: string; avatarUrl: string | null; verified: boolean };
  linkedPack: { id: string; name: string; slug: string } | null;
  linkedPersona: { id: string; slug: string; displayName: string; kind: string } | null;
  linkedPoll: any | null;
};

async function hydratePosts(rows: any[], viewerLikedIds: Set<string>, pollMap: Map<string, any> = new Map()): Promise<FeedPost[]> {
  const pub = serverPublic();
  return Promise.all(rows.map(async (r: any) => ({
    id: r.id,
    body: r.body,
    imageUrl: await signImageUrl(pub, r.image_url),
    likeCount: r.like_count ?? 0,
    commentCount: r.comment_count ?? 0,
    liked: viewerLikedIds.has(r.id),
    createdAt: r.created_at,
    creator: {
      id: r.creators?.id ?? r.creator_id,
      handle: r.creators?.handle ?? "",
      stageName: r.creators?.stage_name ?? "",
      avatarUrl: r.creators?.profiles_public?.avatar_url ?? null,
      verified: r.creators?.verification_status === "verified",
    },
    linkedPack: r.content_packs
      ? { id: r.content_packs.id, name: r.content_packs.name, slug: r.content_packs.slug }
      : null,
    linkedPersona: r.personas
      ? { id: r.personas.id, slug: r.personas.slug, displayName: r.personas.display_name, kind: r.personas.kind }
      : null,
    linkedPoll: r.linked_poll_id ? pollMap.get(r.linked_poll_id) ?? null : null,
  })));
}

const POST_SELECT = `
  id, body, image_url, like_count, comment_count, created_at, creator_id, linked_poll_id,
  creators:creator_id ( id, handle, stage_name, verification_status, user_id ),
  content_packs:linked_pack_id ( id, name, slug ),
  personas:linked_persona_id ( id, slug, display_name, kind )
`;

/**
 * Feed-attached polls: fetches the poll+options for any posts carrying a
 * linked_poll_id, gated by the poll's own visibility (independent of, and on
 * top of, the post's own feed-visibility gate above) and hydrated with this
 * viewer's vote state — reuses hydrateWithViewerState from
 * polls.functions.ts rather than reimplementing the resolution/results logic.
 */
async function loadLinkedPolls(rows: any[], viewerId: string | null): Promise<Map<string, any>> {
  const pollIds = [...new Set(rows.map((r: any) => r.linked_poll_id).filter(Boolean))];
  if (!pollIds.length) return new Map();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { canViewerSeeTier, isPayingSubscriber } = await import("./feed-visibility-access.server");
  const { hydrateWithViewerState } = await import("./polls.functions");

  const { data: polls } = await supabaseAdmin
    .from("polls").select("*, poll_options(id, label, display_order, linked_tip_amount_usd)").in("id", pollIds);
  if (!polls?.length) return new Map();

  const isAuthed = !!viewerId;
  const subCache = new Map<string, boolean>();
  const visible: any[] = [];
  for (const p of polls) {
    let isPaying = false;
    if (isAuthed && p.visibility === "subscribers_only") {
      if (!subCache.has(p.creator_id)) subCache.set(p.creator_id, await isPayingSubscriber(supabaseAdmin, viewerId as string, p.creator_id));
      isPaying = subCache.get(p.creator_id)!;
    }
    if (canViewerSeeTier(p.visibility, { isAuthed, isPayingSubscriber: isPaying })) visible.push(p);
  }

  const hydrated = await hydrateWithViewerState(supabaseAdmin, visible, viewerId);
  return new Map(hydrated.map((p: any) => [p.id, p]));
}

/**
 * Single source of truth for gating feed rows by the visibility model (see
 * feed-visibility-access.server.ts): item override → persona default →
 * platform default. Used by every feed-reading surface below — not
 * reimplemented per surface. Overrides/policies/subscription status are
 * looked up via supabaseAdmin since they're not meant to be publicly
 * readable (RLS on those tables only grants the managing creator/agency/
 * admin), independent of whether the post rows themselves came from the
 * public anon client.
 */
async function filterByFeedVisibility(rows: any[], viewerId: string | null): Promise<any[]> {
  if (!rows.length) return rows;
  const { resolveFeedItemVisibility, canViewerSeeTier, isPayingSubscriber } = await import("./feed-visibility-access.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const postIds = rows.map((r: any) => r.id);
  const personaIds = [...new Set(rows.map((r: any) => r.personas?.id).filter(Boolean))];
  const [{ data: overrides }, { data: policies }] = await Promise.all([
    supabaseAdmin.from("feed_item_visibility_overrides").select("feed_post_id, visibility").in("feed_post_id", postIds),
    personaIds.length
      ? supabaseAdmin.from("feed_visibility_policies").select("persona_id, default_visibility").in("persona_id", personaIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const overrideMap = new Map((overrides ?? []).map((o: any) => [o.feed_post_id, o.visibility]));
  const policyMap = new Map((policies ?? []).map((p: any) => [p.persona_id, p.default_visibility]));

  const isAuthed = !!viewerId;
  const subCache = new Map<string, boolean>();
  const result: any[] = [];
  for (const r of rows) {
    const isOwner = isAuthed && viewerId === r.creators?.user_id;
    if (isOwner) { result.push(r); continue; }

    const resolved = resolveFeedItemVisibility({
      overrideTier: overrideMap.get(r.id) ?? null,
      personaDefaultTier: r.personas?.id ? policyMap.get(r.personas.id) ?? null : null,
    });

    let isPaying = false;
    if (isAuthed && resolved === "subscribers_only") {
      const key = `${viewerId}:${r.creator_id}`;
      if (!subCache.has(key)) subCache.set(key, await isPayingSubscriber(supabaseAdmin, viewerId as string, r.creator_id));
      isPaying = subCache.get(key)!;
    }
    if (canViewerSeeTier(resolved, { isAuthed, isPayingSubscriber: isPaying })) result.push(r);
  }
  return result;
}

// Public: get a creator's posts by handle. Auth optional (adds "liked" and
// unlocks subscriber-only visibility for the viewer's own subscriptions).
export const getCreatorPosts = createServerFn({ method: "GET" })
  .validator((d: { handle: string; limit?: number; viewerId?: string | null }) => d)
  .handler(async ({ data }) => {
    const pub = serverPublic();
    const { data: creator } = await pub
      .from("creators")
      .select("id, user_id, handle, stage_name, verification_status")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!creator) return { items: [] as FeedPost[] };

    const limit = Math.min(data.limit ?? 30, 50);
    const { data: rows, error } = await pub
      .from("creator_posts")
      .select(POST_SELECT)
      .eq("creator_id", creator.id)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const visible = await filterByFeedVisibility(rows ?? [], data.viewerId ?? null);

    // hydrate creator avatar via profiles_public
    const { data: prof } = await pub
      .from("profiles_public")
      .select("avatar_url")
      .eq("id", creator.user_id)
      .maybeSingle();
    const enriched = visible.map((r: any) => ({
      ...r,
      creators: { ...r.creators, profiles_public: { avatar_url: prof?.avatar_url ?? null } },
    }));
    const pollMap = await loadLinkedPolls(visible, data.viewerId ?? null);
    const items = await hydratePosts(enriched, new Set(), pollMap);
    return { items };
  });

// Auth: get followed-creator feed
export const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = Math.min(data?.limit ?? 40, 60);

    const { data: follows } = await supabase
      .from("creator_follows")
      .select("creator_id")
      .eq("fan_id", userId);
    const creatorIds = (follows ?? []).map((r: any) => r.creator_id);
    if (creatorIds.length === 0) return { items: [] as FeedPost[] };

    const pub = serverPublic();
    const { data: rows, error } = await pub
      .from("creator_posts")
      .select(POST_SELECT)
      .in("creator_id", creatorIds)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const visibleRows = await filterByFeedVisibility(rows ?? [], userId);

    const postIds = visibleRows.map((r: any) => r.id);
    const { data: liked } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds.length ? postIds : ["00000000-0000-0000-0000-000000000000"]);
    const likedSet = new Set((liked ?? []).map((r: any) => r.post_id));

    // Hydrate creator avatars
    const userIds = Array.from(new Set(visibleRows.map((r: any) => r.creators?.user_id).filter(Boolean)));
    const { data: profs } = await pub
      .from("profiles_public")
      .select("id, avatar_url")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const avatarByUser = new Map((profs ?? []).map((p: any) => [p.id, p.avatar_url as string | null]));
    const enriched = visibleRows.map((r: any) => ({
      ...r,
      creators: { ...r.creators, profiles_public: { avatar_url: avatarByUser.get(r.creators?.user_id) ?? null } },
    }));

    const pollMap = await loadLinkedPolls(visibleRows, userId);
    const items = await hydratePosts(enriched, likedSet, pollMap);
    return { items };
  });

// Auth: create a post for a creator the user manages
export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    creatorId: string;
    body: string;
    imagePath?: string | null;
    linkedPackId?: string | null;
    linkedPersonaId?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const body = (data.body ?? "").trim();
    if (!body) throw new Error("Post cannot be empty");
    if (body.length > 1000) throw new Error("Post is too long (max 1000 chars)");

    const { data: row, error } = await context.supabase
      .from("creator_posts")
      .insert({
        creator_id: data.creatorId,
        author_user_id: context.userId,
        body,
        image_url: data.imagePath ?? null,
        linked_pack_id: data.linkedPackId ?? null,
        linked_persona_id: data.linkedPersonaId ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("creator_posts").delete().eq("id", data.postId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; like: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (data.like) {
      const { error } = await context.supabase
        .from("post_likes")
        .upsert({ post_id: data.postId, user_id: context.userId }, { onConflict: "post_id,user_id" });
      if (error && !`${error.message}`.includes("duplicate")) throw new Error(error.message);
      return { liked: true };
    } else {
      const { error } = await context.supabase
        .from("post_likes")
        .delete()
        .eq("post_id", data.postId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
  });

export const listComments = createServerFn({ method: "GET" })
  .validator((d: { postId: string }) => d)
  .handler(async ({ data }) => {
    const pub = serverPublic();
    const { data: rows, error } = await pub
      .from("post_comments")
      .select("id, body, created_at, author_user_id")
      .eq("post_id", data.postId)
      .eq("is_removed", false)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.author_user_id)));
    const { data: profs } = await pub
      .from("profiles_public")
      .select("id, display_name, avatar_url")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      authorId: r.author_user_id,
      authorName: byId.get(r.author_user_id)?.display_name ?? "Someone",
      authorAvatar: byId.get(r.author_user_id)?.avatar_url ?? null,
    }));
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; body: string }) => d)
  .handler(async ({ data, context }) => {
    const body = (data.body ?? "").trim();
    if (!body) throw new Error("Comment cannot be empty");
    if (body.length > 500) throw new Error("Comment is too long (max 500 chars)");
    const { data: row, error } = await context.supabase
      .from("post_comments")
      .insert({ post_id: data.postId, author_user_id: context.userId, body })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: row?.id ?? null };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { commentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("post_comments").delete().eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Auth: creator's own packs & personas for the composer picker
export const getComposerOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const [packs, personas] = await Promise.all([
      context.supabase
        .from("content_packs")
        .select("id, name, slug")
        .eq("creator_id", data.creatorId)
        .order("sort_order", { ascending: true }),
      context.supabase
        .from("personas")
        .select("id, slug, display_name, kind")
        .eq("creator_id", data.creatorId)
        .order("sort_order", { ascending: true }),
    ]);
    return {
      packs: packs.data ?? [],
      personas: personas.data ?? [],
    };
  });
