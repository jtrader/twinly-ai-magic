import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Pass 3 — Client-verify-then-consent flow.
 *
 * An agency cannot act on behalf of a client until:
 *   1. The client (creator) is Level 1 identity-verified.
 *   2. The client explicitly consents to the requested scopes.
 * Losing either condition (revocation or identity lapse) auto-suspends
 * the link — the lapse path runs via DB trigger; revocation runs here.
 */

export const CURRENT_AGENCY_CONSENT_POLICY_VERSION = "2026-07-13";

export const VALID_AGENCY_SCOPES = [
  "manage_personas",
  "manage_content",
  "reply_to_supporters",
  "manage_pricing",
  "manage_payouts",
] as const;
export type AgencyScope = (typeof VALID_AGENCY_SCOPES)[number];

function normalizeScopes(input: unknown): AgencyScope[] {
  if (!Array.isArray(input)) throw new Error("scopes must be an array");
  const set = new Set<string>();
  for (const s of input) {
    if (typeof s !== "string") throw new Error("scope must be a string");
    if (!(VALID_AGENCY_SCOPES as readonly string[]).includes(s)) {
      throw new Error(`Unknown scope: ${s}`);
    }
    set.add(s);
  }
  if (set.size === 0) throw new Error("At least one scope is required");
  return Array.from(set) as AgencyScope[];
}

/** Agency owner requests to onboard a client — creates or reuses a pending link. */
export const requestAgencyClientLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string; creatorId: string; requestedScopes: string[] }) => {
    if (!d?.agencyId || !d?.creatorId) throw new Error("agencyId and creatorId required");
    return { agencyId: d.agencyId, creatorId: d.creatorId, scopes: normalizeScopes(d.requestedScopes) };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agency, error: aErr } = await supabaseAdmin
      .from("agencies").select("id, owner_user_id").eq("id", data.agencyId).maybeSingle();
    if (aErr) throw aErr;
    if (!agency || agency.owner_user_id !== userId) {
      throw new Error("Only the agency owner can request client links.");
    }

    const { error: linkErr } = await supabaseAdmin
      .from("agency_creators")
      .upsert(
        { agency_id: data.agencyId, creator_id: data.creatorId, status: "pending", permissions: { requestedScopes: data.scopes } },
        { onConflict: "agency_id,creator_id" },
      );
    if (linkErr) throw linkErr;

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_requested",
      subject_type: "creator",
      subject_id: data.creatorId,
      metadata: { agency_id: data.agencyId, requested_scopes: data.scopes, policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION },
    });

    return { ok: true as const };
  });

/** Client (creator) accepts the link — must be Level 1 verified. Activates the link. */
export const acceptAgencyClientLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string; agreedScopes: string[] }) => {
    if (!d?.agencyId) throw new Error("agencyId required");
    return { agencyId: d.agencyId, scopes: normalizeScopes(d.agreedScopes) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Client must be Level 1.
    const { data: level1 } = await supabase.rpc("has_id_level", { _user_id: userId, _level: 1 });
    if (level1 !== true) {
      throw new Error("You must complete identity verification (Level 1) before consenting to agency management.");
    }

    const { data: creator, error: cErr } = await supabaseAdmin
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (cErr) throw cErr;
    if (!creator) throw new Error("No creator profile found for this account.");

    const { data: link } = await supabaseAdmin
      .from("agency_creators")
      .select("agency_id, status")
      .eq("agency_id", data.agencyId).eq("creator_id", creator.id).maybeSingle();
    if (!link) throw new Error("No pending agency link found. Ask the agency to send an invitation first.");

    const now = new Date().toISOString();

    const { error: consentErr } = await supabaseAdmin
      .from("agency_client_consents")
      .upsert({
        agency_id: data.agencyId,
        creator_id: creator.id,
        agreed_scopes: data.scopes,
        policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION,
        consented_at: now,
        revoked_at: null,
        revoked_reason: null,
      }, { onConflict: "agency_id,creator_id" });
    if (consentErr) throw consentErr;

    const { error: linkErr } = await supabaseAdmin
      .from("agency_creators")
      .update({ status: "active", activated_at: now, suspended_at: null, suspended_reason: null })
      .eq("agency_id", data.agencyId).eq("creator_id", creator.id);
    if (linkErr) throw linkErr;

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_accepted",
      subject_type: "creator",
      subject_id: creator.id,
      metadata: { agency_id: data.agencyId, agreed_scopes: data.scopes, policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION },
    });

    return { ok: true as const };
  });

/** Either the client or the agency owner may revoke. */
export const revokeAgencyClientLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string; creatorId: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: agency }, { data: creator }] = await Promise.all([
      supabaseAdmin.from("agencies").select("owner_user_id").eq("id", data.agencyId).maybeSingle(),
      supabaseAdmin.from("creators").select("user_id").eq("id", data.creatorId).maybeSingle(),
    ]);
    const isAgencyOwner = agency?.owner_user_id === userId;
    const isClient = creator?.user_id === userId;
    if (!isAgencyOwner && !isClient) {
      throw new Error("Only the agency owner or the client may revoke this link.");
    }

    const now = new Date().toISOString();
    const reason = data.reason ?? (isClient ? "revoked_by_client" : "revoked_by_agency");

    await supabaseAdmin.from("agency_client_consents")
      .update({ revoked_at: now, revoked_reason: reason })
      .eq("agency_id", data.agencyId).eq("creator_id", data.creatorId)
      .is("revoked_at", null);

    await supabaseAdmin.from("agency_creators")
      .update({ status: "revoked", suspended_at: now, suspended_reason: reason })
      .eq("agency_id", data.agencyId).eq("creator_id", data.creatorId);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_revoked",
      subject_type: "creator",
      subject_id: data.creatorId,
      metadata: { agency_id: data.agencyId, reason, by: isClient ? "client" : "agency" },
    });

    return { ok: true as const };
  });

/** Read-side: does this agency currently have permission to act on this client? */
export const checkAgencyClientAuthorized = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { agencyId: string; creatorId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("has_active_agency_consent", {
      _agency_id: data.agencyId, _creator_id: data.creatorId,
    });
    if (error) throw error;
    return { authorized: ok === true };
  });

/**
 * Server-side gate for any code path that runs work on behalf of a client.
 * Throws when the agency does not have active consent + client Level 1.
 */
export async function assertAgencyClientAuthorized(
  supabase: any, agencyId: string, creatorId: string,
): Promise<void> {
  const { data: ok, error } = await supabase.rpc("has_active_agency_consent", {
    _agency_id: agencyId, _creator_id: creatorId,
  });
  if (error) throw error;
  if (ok !== true) {
    throw new Error("Agency is not authorized for this client (consent missing, revoked, or client identity lapsed).");
  }
}