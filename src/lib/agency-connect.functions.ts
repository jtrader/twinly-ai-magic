import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertIdLevel } from "./identity-verification.functions";
import {
  CURRENT_AGENCY_CONSENT_POLICY_VERSION,
  VALID_AGENCY_SCOPES,
  type AgencyScope,
} from "./agency-consent.functions";

/**
 * Creator → Agency onboarding (Creator/Agency Account Management Agreement v1).
 *
 * A Level-1 + Level-2 verified creator picks an agency, accepts the
 * agreement, and submits contact + requested scopes. The agency owner then
 * approves or declines from their agency dashboard. On approval we mint the
 * matching `agency_client_consents` row using the scopes the creator
 * already agreed to at submission time.
 */

export const CREATOR_AGENCY_AGREEMENT_VERSION = "creator-agency-agreement-v1-2026-07-13";

const RequestSchema = z.object({
  agencyId: z.string().uuid(),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().min(5).max(40),
  agreedScopes: z.array(z.string()).min(1),
  agreementVersion: z.string().min(1),
  note: z.string().trim().max(1000).optional().nullable(),
});

function normalizeScopes(input: string[]): AgencyScope[] {
  const set = new Set<string>();
  for (const s of input) {
    if (!(VALID_AGENCY_SCOPES as readonly string[]).includes(s)) {
      throw new Error(`Unknown scope: ${s}`);
    }
    set.add(s);
  }
  if (set.size === 0) throw new Error("At least one scope is required");
  return Array.from(set) as AgencyScope[];
}

export const listAvailableAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agencies")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { agencies: (data ?? []) as { id: string; name: string }[] };
  });

export const getMyAgencyConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await supabase
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (!creator) return { creatorId: null, link: null };
    const { data: link } = await supabase
      .from("agency_creators")
      .select("agency_id, status, requested_by, contact_email, contact_phone, agreement_version, agreement_accepted_at, requested_scopes, request_note, activated_at, suspended_at, suspended_reason")
      .eq("creator_id", creator.id)
      .not("status", "in", "(revoked)")
      .maybeSingle();
    if (!link) return { creatorId: creator.id, link: null };
    const { data: agency } = await supabase
      .from("agencies").select("id, name").eq("id", link.agency_id).maybeSingle();
    return { creatorId: creator.id, link: { ...link, agency } };
  });

export const requestAgencyLinkAsCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fail closed: creator must be L1 AND L2 verified.
    await assertIdLevel(context, 1);
    await assertIdLevel(context, 2);

    const scopes = normalizeScopes(data.agreedScopes);

    const { data: creator, error: cErr } = await supabase
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!creator) throw new Error("Complete creator onboarding before requesting agency management.");

    // Refuse if there's already a live link (pending / active / suspended).
    const { data: existing } = await supabase
      .from("agency_creators")
      .select("agency_id, status")
      .eq("creator_id", creator.id)
      .in("status", ["pending", "active", "suspended"])
      .maybeSingle();
    if (existing) {
      throw new Error(
        existing.status === "pending"
          ? "You already have a pending agency request. Cancel it before starting a new one."
          : "You are already linked to an agency. Revoke the existing link first.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const { error: insertErr } = await supabaseAdmin
      .from("agency_creators")
      .insert({
        agency_id: data.agencyId,
        creator_id: creator.id,
        status: "pending",
        requested_by: "creator",
        contact_email: data.contactEmail,
        contact_phone: data.contactPhone,
        agreement_version: data.agreementVersion,
        agreement_accepted_at: now,
        request_note: data.note ?? null,
        requested_scopes: scopes,
        permissions: { requestedScopes: scopes },
      });
    if (insertErr) throw new Error(insertErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_requested_by_creator",
      subject_type: "creator",
      subject_id: creator.id,
      metadata: {
        agency_id: data.agencyId,
        requested_scopes: scopes,
        agreement_version: data.agreementVersion,
        consent_policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION,
        contact_email: data.contactEmail,
      },
    });

    return { ok: true as const };
  });

export const cancelMyAgencyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agencyId: string }) => {
    if (!d?.agencyId) throw new Error("agencyId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await supabase
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (!creator) throw new Error("No creator profile.");
    const { error } = await supabase
      .from("agency_creators")
      .delete()
      .eq("agency_id", data.agencyId)
      .eq("creator_id", creator.id)
      .eq("status", "pending")
      .eq("requested_by", "creator");
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_request_cancelled",
      subject_type: "creator",
      subject_id: creator.id,
      metadata: { agency_id: data.agencyId },
    });
    return { ok: true as const };
  });

/** Agency owner: list pending creator-initiated requests for their agency. */
export const listPendingCreatorRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agencyId: string }) => {
    if (!d?.agencyId) throw new Error("agencyId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agency } = await supabaseAdmin
      .from("agencies").select("id, owner_user_id").eq("id", data.agencyId).maybeSingle();
    if (!agency || agency.owner_user_id !== userId) {
      throw new Error("Only the agency owner can view requests.");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("agency_creators")
      .select("agency_id, creator_id, contact_email, contact_phone, agreement_version, agreement_accepted_at, requested_scopes, request_note, created_at, creators!inner(id, handle, stage_name, avatar_url, verification_status)")
      .eq("agency_id", data.agencyId)
      .eq("status", "pending")
      .eq("requested_by", "creator")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

/** Agency owner: approve or decline a creator-initiated request. */
export const decideCreatorAgencyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agencyId: string; creatorId: string; decision: "approved" | "declined"; reason?: string }) => {
    if (!d?.agencyId || !d?.creatorId) throw new Error("agencyId and creatorId required");
    if (d.decision !== "approved" && d.decision !== "declined") throw new Error("invalid decision");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agency } = await supabaseAdmin
      .from("agencies").select("id, owner_user_id").eq("id", data.agencyId).maybeSingle();
    if (!agency || agency.owner_user_id !== userId) {
      throw new Error("Only the agency owner can decide this request.");
    }

    const { data: row } = await supabaseAdmin
      .from("agency_creators")
      .select("agency_id, creator_id, status, requested_by, requested_scopes, agreement_version, agreement_accepted_at")
      .eq("agency_id", data.agencyId).eq("creator_id", data.creatorId).maybeSingle();
    if (!row || row.status !== "pending" || row.requested_by !== "creator") {
      throw new Error("No pending creator request for that link.");
    }

    if (data.decision === "declined") {
      const { error: delErr } = await supabaseAdmin
        .from("agency_creators")
        .delete()
        .eq("agency_id", data.agencyId).eq("creator_id", data.creatorId);
      if (delErr) throw new Error(delErr.message);
      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: userId,
        action: "agency_client_link_request_declined",
        subject_type: "creator",
        subject_id: data.creatorId,
        metadata: { agency_id: data.agencyId, reason: data.reason ?? null },
      });
      return { ok: true as const, status: "declined" as const };
    }

    const scopes = Array.isArray(row.requested_scopes) ? row.requested_scopes : [];
    if (scopes.length === 0) {
      throw new Error("Cannot approve: request has no scopes.");
    }
    const now = new Date().toISOString();

    // Mint the consent record — creator already agreed to these scopes at submission.
    const { error: consentErr } = await supabaseAdmin
      .from("agency_client_consents")
      .upsert({
        agency_id: data.agencyId,
        creator_id: data.creatorId,
        agreed_scopes: scopes,
        policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION,
        consented_at: row.agreement_accepted_at ?? now,
        revoked_at: null,
        revoked_reason: null,
      }, { onConflict: "agency_id,creator_id" });
    if (consentErr) throw new Error(consentErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("agency_creators")
      .update({ status: "active", activated_at: now, suspended_at: null, suspended_reason: null })
      .eq("agency_id", data.agencyId).eq("creator_id", data.creatorId);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: userId,
      action: "agency_client_link_request_approved",
      subject_type: "creator",
      subject_id: data.creatorId,
      metadata: {
        agency_id: data.agencyId,
        agreed_scopes: scopes,
        agreement_version: row.agreement_version,
        consent_policy_version: CURRENT_AGENCY_CONSENT_POLICY_VERSION,
      },
    });

    return { ok: true as const, status: "approved" as const };
  });

/**
 * Return a chronological timeline of agency-agreement events for the current
 * creator (submitted / cancelled / approved / declined / suspended / revoked).
 * Audit rows are admin-only via RLS, so we read them with the service role
 * inside the handler, scoped to the caller's own creator id.
 */
export const getMyAgencyTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: creator } = await supabase
      .from("creators").select("id").eq("user_id", userId).maybeSingle();
    if (!creator) return { events: [] as AgencyTimelineEvent[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const relevantActions = [
      "agency_client_link_requested_by_creator",
      "agency_client_link_request_cancelled",
      "agency_client_link_request_approved",
      "agency_client_link_request_declined",
      "agency_client_auto_suspended",
      "agency_client_link_revoked",
    ];
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, created_at, metadata, actor_user_id")
      .eq("subject_type", "creator")
      .eq("subject_id", creator.id)
      .in("action", relevantActions)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    // Resolve agency names for a friendlier UI.
    const agencyIds = Array.from(new Set(
      (data ?? []).map((r: any) => (r.metadata as any)?.agency_id).filter(Boolean)
    )) as string[];
    const agencyNames: Record<string, string> = {};
    if (agencyIds.length > 0) {
      const { data: ags } = await supabaseAdmin
        .from("agencies").select("id, name").in("id", agencyIds);
      for (const a of ags ?? []) agencyNames[a.id] = a.name;
    }

    const events: AgencyTimelineEvent[] = (data ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      createdAt: r.created_at as string,
      agencyId: (r.metadata as any)?.agency_id ?? null,
      agencyName: (r.metadata as any)?.agency_id
        ? (agencyNames[(r.metadata as any).agency_id] ?? null)
        : null,
      reason:
        (r.metadata as any)?.reason ??
        (r.metadata as any)?.decline_reason ??
        (r.metadata as any)?.suspended_reason ??
        null,
      metadata: (r.metadata as any) ?? {},
    }));
    return { events };
  });

export type AgencyTimelineEvent = {
  id: string;
  action: string;
  createdAt: string;
  agencyId: string | null;
  agencyName: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
};