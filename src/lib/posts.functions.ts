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
};

async function hydratePosts(rows: any[], viewerLikedIds: Set<string>): Promise<FeedPost[]> {
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
  })));
}

const POST_SELECT = `
  id, body, image_url, like_count, comment_count, created_at, creator_id,
  creators:creator_id ( id, handle, stage_name, verification_status, user_id ),
  content_packs:linked_pack_id ( id, name, slug ),
  personas:linked_persona_id ( id, slug, display_name, kind )
`;

// Public: get a creator's posts by handle. Auth optional (adds "liked").
export const getCreatorPosts = createServerFn({ method: "GET" })
  .validator((d: { handle: string; limit?: number }) => d)
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

    // hydrate creator avatar via profiles_public
    const { data: prof } = await pub
      .from("profiles_public")
      .select("avatar_url")
      .eq("id", creator.user_id)
      .maybeSingle();
    const enriched = (rows ?? []).map((r: any) => ({
      ...r,
      creators: { ...r.creators, profiles_public: { avatar_url: prof?.avatar_url ?? null } },
    }));
    const items = await hydratePosts(enriched, new Set());
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

    const postIds = (rows ?? []).map((r: any) => r.id);
    const { data: liked } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds.length ? postIds : ["00000000-0000-0000-0000-000000000000"]);
    const likedSet = new Set((liked ?? []).map((r: any) => r.post_id));

    // Hydrate creator avatars
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.creators?.user_id).filter(Boolean)));
    const { data: profs } = await pub
      .from("profiles_public")
      .select("id, avatar_url")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const avatarByUser = new Map((profs ?? []).map((p: any) => [p.id, p.avatar_url as string | null]));
    const enriched = (rows ?? []).map((r: any) => ({
      ...r,
      creators: { ...r.creators, profiles_public: { avatar_url: avatarByUser.get(r.creators?.user_id) ?? null } },
    }));

    const items = await hydratePosts(enriched, likedSet);
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
