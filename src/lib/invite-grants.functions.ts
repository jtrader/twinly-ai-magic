import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

/**
 * Pass 2 — Supporter invite grants.
 *
 * Distinct from the older `persona_invites` table (which gates whole
 * `invite_only` visibility personas). `invite_grants` are creator-issued
 * codes that let a *verified* supporter unlock a persona that has
 * `requires_verified_supporter = true`, with optional expiry and bounded
 * use count (default one-shot). Grants are automatically revoked by the
 * database trigger `invite_grants_auto_revoke` when the redeemer's Level 1
 * identity verification lapses.
 */

type InviteGrantRow = {
  id: string;
  code: string;
  note: string | null;
  persona_id: string;
  creator_id: string;
  max_uses: number;
  uses_count: number;
  expires_at: string | null;
  redeemed_by_user_id: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
};

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Create your creator profile first.");
  return data as { id: string; handle: string };
}

async function requireOwnedPersona(supabase: any, creatorId: string, personaId: string) {
  const { data, error } = await supabase
    .from("personas")
    .select("id, slug, display_name, creator_id, requires_verified_supporter")
    .eq("id", personaId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Persona not found.");
  return data;
}

function generateCode(): string {
  // 24 chars, URL-safe. Not a UUID so it reads shorter in share links.
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    .slice(0, 24);
}

export const createInviteGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    personaId: string;
    note?: string;
    expiresInHours?: number;
    maxUses?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const persona = await requireOwnedPersona(supabase, creator.id, data.personaId);

    const maxUses = Math.max(1, Math.min(100, Math.floor(data.maxUses ?? 1)));
    const expiresAt = data.expiresInHours && data.expiresInHours > 0
      ? new Date(Date.now() + Math.min(24 * 90, data.expiresInHours) * 3600 * 1000).toISOString()
      : null;

    const code = generateCode();
    const { data: row, error } = await supabase
      .from("invite_grants")
      .insert({
        creator_id: creator.id,
        persona_id: persona.id,
        code,
        note: data.note?.trim().slice(0, 200) || null,
        max_uses: maxUses,
        expires_at: expiresAt,
        created_by_user_id: userId,
      })
      .select("*")
      .single();
    if (error) throw error;

    await logAudit(userId, "invite_grant.created",
      { type: "invite_grant", id: row.id },
      {
        persona_id: persona.id,
        creator_id: creator.id,
        max_uses: maxUses,
        expires_at: expiresAt,
        requires_verified_supporter: !!(persona as any).requires_verified_supporter,
      },
    );
    return { grant: row as InviteGrantRow };
  });

export const listInviteGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { personaId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await requireOwnedPersona(supabase, creator.id, data.personaId);
    const { data: rows, error } = await supabase
      .from("invite_grants")
      .select("*")
      .eq("persona_id", data.personaId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { grants: (rows ?? []) as InviteGrantRow[] };
  });

export const revokeInviteGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { grantId: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: existing, error: readErr } = await supabase
      .from("invite_grants")
      .select("id, persona_id, creator_id, revoked_at")
      .eq("id", data.grantId)
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Invite grant not found.");
    if (existing.revoked_at) return { ok: true };

    const { error } = await supabase
      .from("invite_grants")
      .update({
        revoked_at: new Date().toISOString(),
        revocation_reason: data.reason?.trim().slice(0, 120) || "creator_revoked",
      })
      .eq("id", data.grantId)
      .eq("creator_id", creator.id);
    if (error) throw error;
    await logAudit(userId, "invite_grant.revoked",
      { type: "invite_grant", id: data.grantId },
      {
        persona_id: existing.persona_id,
        creator_id: existing.creator_id,
        reason: data.reason?.trim() || "creator_revoked",
      },
    );
    return { ok: true };
  });

/** Public: minimal preview of a grant for the redemption landing page. */
export const getInviteGrantPreview = createServerFn({ method: "GET" })
  .validator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: grant } = await supabaseAdmin
      .from("invite_grants")
      .select("id, persona_id, creator_id, max_uses, uses_count, expires_at, revoked_at, redeemed_by_user_id")
      .eq("code", data.code)
      .maybeSingle();
    if (!grant) return null;
    const [{ data: persona }, { data: creator }] = await Promise.all([
      supabaseAdmin
        .from("personas")
        .select("slug, display_name, disclosure_label, kind, requires_verified_supporter, is_explicit")
        .eq("id", grant.persona_id)
        .maybeSingle(),
      supabaseAdmin
        .from("creators")
        .select("handle, stage_name")
        .eq("id", grant.creator_id)
        .maybeSingle(),
    ]);
    if (!persona || !creator) return null;
    const now = Date.now();
    const expired = grant.expires_at ? new Date(grant.expires_at).getTime() < now : false;
    const exhausted = grant.uses_count >= grant.max_uses;
    const status: "available" | "revoked" | "expired" | "exhausted" =
      grant.revoked_at ? "revoked"
      : expired ? "expired"
      : exhausted ? "exhausted"
      : "available";
    return { status, persona, creator, expiresAt: grant.expires_at };
  });

export const redeemInviteGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { code: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Redeemer MUST hold Level 1 verification. If they don't, we tell them
    // to verify first — the whole point of a supporter grant is that it
    // unlocks a persona for someone whose adulthood/identity we trust.
    const { data: hasLevel } = await supabase.rpc("has_id_level", {
      _user_id: userId, _level: 1,
    });
    if (!hasLevel) {
      throw new Error("Verify your identity (~3 minutes) before redeeming this invite.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: grant, error } = await supabaseAdmin
      .from("invite_grants")
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw error;
    if (!grant) throw new Error("Invite code not found.");
    if (grant.revoked_at) throw new Error("This invite has been revoked.");
    if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
      throw new Error("This invite has expired.");
    }
    const alreadyMine = grant.redeemed_by_user_id === userId;
    if (!alreadyMine) {
      if (grant.uses_count >= grant.max_uses) {
        throw new Error("This invite has already been used.");
      }
      const { error: updErr } = await supabaseAdmin
        .from("invite_grants")
        .update({
          redeemed_by_user_id: userId,
          redeemed_at: new Date().toISOString(),
          uses_count: grant.uses_count + 1,
        })
        .eq("id", grant.id);
      if (updErr) throw updErr;

      await logAudit(userId, "invite_grant.accepted",
        { type: "invite_grant", id: grant.id },
        {
          persona_id: grant.persona_id,
          creator_id: grant.creator_id,
          max_uses: grant.max_uses,
          uses_count: grant.uses_count + 1,
        },
      );
    }
    const [{ data: persona }, { data: creator }] = await Promise.all([
      supabaseAdmin.from("personas").select("slug").eq("id", grant.persona_id).maybeSingle(),
      supabaseAdmin.from("creators").select("handle").eq("id", grant.creator_id).maybeSingle(),
    ]);
    if (!persona || !creator) throw new Error("Persona no longer exists.");
    return { creatorHandle: creator.handle, personaSlug: persona.slug };
  });

/** DB-backed access check: does this user hold a live redeemed invite grant? */
export async function checkInviteGrantAccess(
  supabase: any,
  personaId: string,
  viewerId: string | null,
): Promise<boolean> {
  if (!viewerId) return false;
  const { data } = await supabase.rpc("has_active_invite_grant", {
    _user_id: viewerId, _persona_id: personaId,
  });
  return !!data;
}