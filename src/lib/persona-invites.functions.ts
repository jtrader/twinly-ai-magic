import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Create your creator profile first.");
  return data as { id: string; handle: string };
}

async function requireOwnedPersona(supabase: any, creatorId: string, personaId: string) {
  const { data, error } = await supabase
    .from("personas").select("id, slug, display_name, creator_id")
    .eq("id", personaId).eq("creator_id", creatorId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Persona not found.");
  return data as { id: string; slug: string; display_name: string; creator_id: string };
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export const createPersonaInvite = createServerFn({ method: "POST" })
  .validator((d: { personaId: string; note?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);

    const token = generateToken();
    const { data: row, error } = await supabase
      .from("persona_invites")
      .insert({
        persona_id: data.personaId,
        creator_id: creator.id,
        token,
        note: data.note?.trim().slice(0, 200) || null,
      })
      .select("id, token, status, created_at")
      .single();
    if (error) throw error;
    await logAudit(userId, "persona.invite_created", { type: "persona", id: data.personaId }, {});
    return { invite: row };
  });

export const listPersonaInvites = createServerFn({ method: "POST" })
  .validator((d: { personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);
    const { data: rows, error } = await supabase
      .from("persona_invites")
      .select("id, token, status, note, created_at, accepted_at, revoked_at, invited_fan_id")
      .eq("persona_id", data.personaId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { invites: rows ?? [] };
  });

export const revokePersonaInvite = createServerFn({ method: "POST" })
  .validator((d: { inviteId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { error } = await supabase
      .from("persona_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .eq("creator_id", creator.id);
    if (error) throw error;
    await logAudit(userId, "persona.invite_revoked", { type: "persona_invite", id: data.inviteId }, {});
    return { ok: true };
  });

/**
 * Public preview for the invite landing page — deliberately returns only
 * enough to let a fan decide whether to accept (creator/persona identity,
 * disclosure label), never the persona's feed or chat content itself.
 */
export const getInvitePreview = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("persona_invites")
      .select("status, persona_id, creator_id")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return null;
    const [{ data: persona }, { data: creator }] = await Promise.all([
      supabaseAdmin.from("personas").select("slug, display_name, disclosure_label, kind").eq("id", invite.persona_id).maybeSingle(),
      supabaseAdmin.from("creators").select("handle, stage_name").eq("id", invite.creator_id).maybeSingle(),
    ]);
    if (!persona || !creator) return null;
    return { status: invite.status as "pending" | "accepted" | "revoked", persona, creator };
  });

export const acceptPersonaInvite = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("persona_invites")
      .select("id, status, invited_fan_id, persona_id, creator_id")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw error;
    if (!invite) throw new Error("Invite not found.");
    if (invite.status === "revoked") throw new Error("This invite has been revoked.");
    if (invite.invited_fan_id && invite.invited_fan_id !== userId) {
      throw new Error("This invite has already been used by someone else.");
    }
    if (invite.status !== "accepted") {
      const { error: updErr } = await supabaseAdmin
        .from("persona_invites")
        .update({ status: "accepted", invited_fan_id: userId, accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
      if (updErr) throw updErr;
    }
    const [{ data: persona }, { data: creator }] = await Promise.all([
      supabaseAdmin.from("personas").select("slug").eq("id", invite.persona_id).maybeSingle(),
      supabaseAdmin.from("creators").select("handle").eq("id", invite.creator_id).maybeSingle(),
    ]);
    if (!persona || !creator) throw new Error("Persona no longer exists.");
    await logAudit(userId, "persona.invite_accepted", { type: "persona_invite", id: invite.id }, {});
    return { creatorHandle: creator.handle, personaSlug: persona.slug };
  });

/**
 * Pure-ish access check shared by every fan-facing read/write path that
 * needs to let an invited fan through an invite_only persona. Takes an
 * already-resolved list of accepted invite fan ids so the actual matching
 * logic (does this viewer have access) is unit-testable without a DB.
 */
export function hasAcceptedInvite(acceptedFanIds: string[], viewerId: string | null): boolean {
  if (!viewerId) return false;
  return acceptedFanIds.includes(viewerId);
}

/** DB-backed wrapper: is this user an accepted invitee for this persona? */
export async function checkPersonaInviteAccess(
  supabase: any,
  personaId: string,
  viewerId: string | null,
): Promise<boolean> {
  if (!viewerId) return false;
  const { data } = await supabase
    .from("persona_invites")
    .select("id")
    .eq("persona_id", personaId)
    .eq("invited_fan_id", viewerId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();
  return !!data;
}
