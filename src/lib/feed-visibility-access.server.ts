/**
 * Shared authority for feed-visibility management (RBAC) and the feed
 * visibility resolution order. Both are pure/DB-agnostic at their core so
 * they can be unit tested directly — see __tests__/feed-visibility.test.ts.
 *
 * Every visibility-mutating endpoint and every feed-rendering surface must
 * go through these, not reimplement the checks inline.
 */

export type ManagerRole = "admin" | "creator" | "agency";
export type FeedVisibilityTier = "public" | "logged_in" | "subscribers_only";

/** The floor when neither an override nor a persona default applies. */
export const PLATFORM_DEFAULT_TIER: FeedVisibilityTier = "subscribers_only";

const TIER_RANK: Record<FeedVisibilityTier, number> = {
  public: 0,
  logged_in: 1,
  subscribers_only: 2,
};

/**
 * Which of admin / creator(own) / agency(managed) applies to this caller for
 * this creator, given already-fetched facts — mirrors (and must stay in sync
 * with) public.can_manage_creator's three branches:
 *   1. caller owns the creator row
 *   2. caller owns an agency assigned to the creator via agency_creators
 *   3. caller has the admin role
 * Returns null if none apply (e.g. a supporter/fan, or an agency/creator
 * acting outside their own scope) — callers must treat null as Forbidden.
 */
export function resolveFeedManagerRole(facts: {
  isAdmin: boolean;
  callerId: string;
  creatorOwnerUserId: string | null;
  agencyManagesCreator: boolean;
}): ManagerRole | null {
  if (facts.creatorOwnerUserId && facts.creatorOwnerUserId === facts.callerId) return "creator";
  if (facts.agencyManagesCreator) return "agency";
  if (facts.isAdmin) return "admin";
  return null;
}

/**
 * Visibility resolution order: item override → persona default → platform
 * default. A post with no linked persona has no default tier to consult, so
 * it falls straight through to the platform default unless overridden.
 */
export function resolveFeedItemVisibility(facts: {
  overrideTier?: FeedVisibilityTier | null;
  personaDefaultTier?: FeedVisibilityTier | null;
}): FeedVisibilityTier {
  return facts.overrideTier ?? facts.personaDefaultTier ?? PLATFORM_DEFAULT_TIER;
}

/** Can a viewer in this state see content resolved to this tier? */
export function canViewerSeeTier(
  tier: FeedVisibilityTier,
  viewer: { isAuthed: boolean; isPayingSubscriber: boolean },
): boolean {
  const viewerRank = viewer.isPayingSubscriber ? 2 : viewer.isAuthed ? 1 : 0;
  return viewerRank >= TIER_RANK[tier];
}

/**
 * Resolves the caller's ManagerRole for a target creator, or throws. Uses
 * the same tables/relationships as public.can_manage_creator (creators
 * ownership, agencies/agency_creators, has_role admin) so the two never
 * silently diverge.
 */
export async function requireFeedManagerRole(
  supabaseAdmin: any,
  callerId: string,
  creatorId: string,
): Promise<ManagerRole> {
  const [{ data: isAdmin }, { data: creator }, { data: agencyLink }] = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: callerId, _role: "admin" }),
    supabaseAdmin.from("creators").select("user_id").eq("id", creatorId).maybeSingle(),
    supabaseAdmin
      .from("agency_creators")
      .select("agency_id, agencies:agency_id(owner_user_id)")
      .eq("creator_id", creatorId),
  ]);

  const agencyManagesCreator = (agencyLink ?? []).some(
    (l: any) => l.agencies?.owner_user_id === callerId,
  );

  const role = resolveFeedManagerRole({
    isAdmin: !!isAdmin,
    callerId,
    creatorOwnerUserId: creator?.user_id ?? null,
    agencyManagesCreator,
  });
  if (!role) throw new Error("Forbidden: you don't manage this creator's feed.");
  return role;
}

/** Resolves creator_id for a persona, throwing if the persona doesn't exist. */
export async function creatorIdForPersona(supabaseAdmin: any, personaId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("personas").select("creator_id").eq("id", personaId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Persona not found");
  return data.creator_id as string;
}

/** Resolves creator_id for a feed post, throwing if it doesn't exist. */
export async function creatorIdForPost(supabaseAdmin: any, postId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("creator_posts").select("creator_id").eq("id", postId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Post not found");
  return data.creator_id as string;
}

/** Reused by feed rendering (posts.functions.ts) and the admin preview mode. */
export async function isPayingSubscriber(supabaseAdmin: any, fanId: string, creatorId: string): Promise<boolean> {
  const { SUBSCRIBER_TIERS } = await import("./fan-feed.functions");
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("fan_id", fanId)
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .maybeSingle();
  if (!sub) return false;
  const stillValid = sub.current_period_end ? new Date(sub.current_period_end).getTime() > Date.now() : true;
  return stillValid && SUBSCRIBER_TIERS.has(sub.tier as string);
}

export async function writeFeedVisibilityAudit(
  supabase: any,
  entry: {
    actorId: string;
    actorRole: ManagerRole;
    targetType: "persona_default" | "feed_item_override";
    targetId: string;
    beforeValue: unknown;
    afterValue: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from("feed_visibility_audit_log").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    target_type: entry.targetType,
    target_id: entry.targetId,
    before_value: entry.beforeValue as any,
    after_value: entry.afterValue as any,
  });
  if (error) throw error;
}
