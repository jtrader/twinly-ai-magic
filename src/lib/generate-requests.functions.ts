import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Complete your creator profile first.");
  return data as { id: string };
}

const OUTPUT_TYPES = ["image","audio","video","talking_head","promo_banner"] as const;
type OutputType = typeof OUTPUT_TYPES[number];

// Which consent flag each output type requires. Enforced server-side so
// synthetic generation can never be requested for a modality the creator
// has not explicitly consented to via their Digital Twin Profile.
const CONSENT_FIELD: Record<OutputType, "image_ok" | "voice_ok" | "video_ok"> = {
  image: "image_ok",
  promo_banner: "image_ok",
  audio: "voice_ok",
  video: "video_ok",
  talking_head: "video_ok",
};

/**
 * Verifies the creator has an active Digital Twin consent covering the
 * requested output modality, the persona belongs to them and is approved
 * ("published" visibility), and the pack (if any) belongs to them.
 * Returns the loaded consent + persona rows for downstream namespacing.
 */
export async function assertTwinPolicy(
  supabase: any,
  creatorId: string,
  outputType: OutputType,
  personaId: string | null,
  packId: string | null,
) {
  if (!personaId) {
    throw new Error("Choose an approved persona before requesting synthetic content.");
  }

  const { data: creator, error: cErr } = await supabase
    .from("creators")
    .select("id, digital_twin_status")
    .eq("id", creatorId)
    .single();
  if (cErr) throw cErr;
  if (creator.digital_twin_status !== "ready") {
    throw new Error("Your Digital Twin Profile must be marked ready before generating synthetic content.");
  }

  const { data: consent, error: kErr } = await supabase
    .from("digital_twin_consent")
    .select("likeness_ok, image_ok, voice_ok, video_ok, signed_at, revoked_at, forbidden_uses")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (kErr) throw kErr;
  if (!consent || !consent.signed_at || consent.revoked_at) {
    throw new Error("Active Digital Twin consent is required.");
  }
  if (!consent.likeness_ok) {
    throw new Error("Likeness consent has not been granted.");
  }
  const field = CONSENT_FIELD[outputType];
  if (!consent[field]) {
    throw new Error(`Consent for ${outputType.replace("_"," ")} generation has not been granted.`);
  }

  // Forbidden-use guard: if the creator listed the output modality in
  // forbidden_uses, block outright.
  const forbidden: string[] = Array.isArray(consent.forbidden_uses)
    ? consent.forbidden_uses.map((v: any) => String(v).toLowerCase())
    : [];
  if (forbidden.includes(outputType) || forbidden.includes(field.replace("_ok",""))) {
    throw new Error("This output type is on your forbidden-uses list.");
  }

  const { data: persona, error: pErr } = await supabase
    .from("personas")
    .select("id, visibility, creator_id")
    .eq("id", personaId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!persona) throw new Error("Persona not found in your namespace.");
  if (persona.visibility !== "published") {
    throw new Error("Persona must be published (approved) before it can receive synthetic content.");
  }

  if (packId) {
    const { data: pack, error: kErr2 } = await supabase
      .from("content_packs")
      .select("id, status, creator_id, name")
      .eq("id", packId)
      .eq("creator_id", creatorId)
      .maybeSingle();
    if (kErr2) throw kErr2;
    if (!pack) throw new Error("Content pack not found in your namespace.");
    if (pack.status !== "approved") {
      throw new Error(`Pack "${pack.name}" is ${pack.status ?? "not approved"} — only approved packs can be used for generation.`);
    }

    // Pack must be explicitly attached to the target persona
    const { data: link, error: linkErr } = await supabase
      .from("content_pack_personas")
      .select("permission_type")
      .eq("pack_id", packId)
      .eq("persona_id", personaId)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) {
      throw new Error(`Pack "${pack.name}" is not attached to this persona. Attach it in the Persona editor first.`);
    }
    if (link.permission_type === "restricted") {
      throw new Error(`Pack "${pack.name}" is set to Restricted on this persona and cannot be used as a generation source.`);
    }

    // Reject if any pack asset is forbidden (rejected / flagged / blocked / restricted / do_not_use)
    const { data: packAssets, error: paErr } = await supabase
      .from("content_pack_items")
      .select("asset_id, content_assets:asset_id(id, approval_status, moderation_status, internal_label)")
      .eq("pack_id", packId);
    if (paErr) throw paErr;
    const forbiddenAssets = (packAssets ?? []).filter((row: any) => {
      const a = row.content_assets;
      if (!a) return false;
      if (a.approval_status === "rejected") return true;
      if (a.moderation_status === "flagged" || a.moderation_status === "blocked") return true;
      if (a.internal_label === "restricted" || a.internal_label === "do_not_use") return true;
      return false;
    });
    if (forbiddenAssets.length) {
      throw new Error(`Pack "${pack.name}" contains ${forbiddenAssets.length} forbidden asset(s). Remove or resolve them before generating.`);
    }

    return { consent, persona, packPermission: link.permission_type as "included" | "ppv" | "restricted" };
  }

  return { consent, persona, packPermission: null as "included" | "ppv" | "restricted" | null };
}

export const listGenerationRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { status?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    let q = supabase
      .from("generation_requests")
      .select("id, persona_id, pack_id, output_type, style_preset, prompt_notes, quantity, status, disclosure_label, produced_asset_ids, reviewer_note, submitted_at, reviewed_at, created_at, personas:persona_id(display_name, slug), content_packs:pack_id(name, slug)")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await (q as any);
    if (error) throw error;
    return { requests: rows ?? [] };
  });

export const createGenerationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    personaId?: string | null;
    packId?: string | null;
    outputType: OutputType;
    stylePreset?: string;
    promptNotes: string;
    quantity: number;
    disclosureLabel?: string;
    submit?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    if (!OUTPUT_TYPES.includes(data.outputType)) throw new Error("Invalid output type.");
    const qty = Math.max(1, Math.min(12, Math.round(data.quantity || 1)));
    const notes = (data.promptNotes ?? "").trim().slice(0, 2000);
    if (!notes) throw new Error("Add prompt notes so reviewers know what to generate.");

    // Enforce twin-consent + persona-approval policy at submit time. Drafts
    // may be saved without a persona, but submitting/queueing requires it.
    if (data.submit) {
      await assertTwinPolicy(supabase, creator.id, data.outputType, data.personaId ?? null, data.packId ?? null);
    } else if (data.personaId || data.packId) {
      // Even for drafts, verify ownership so cross-creator IDs cannot be stored.
      if (data.personaId) {
        const { data: p } = await supabase.from("personas").select("id").eq("id", data.personaId).eq("creator_id", creator.id).maybeSingle();
        if (!p) throw new Error("Persona not found in your namespace.");
      }
      if (data.packId) {
        const { data: k } = await supabase.from("content_packs").select("id").eq("id", data.packId).eq("creator_id", creator.id).maybeSingle();
        if (!k) throw new Error("Content pack not found in your namespace.");
      }
    }

    const status = data.submit ? "queued" : "draft";
    const { data: row, error } = await supabase
      .from("generation_requests").insert({
        creator_id: creator.id,
        persona_id: data.personaId || null,
        pack_id: data.packId || null,
        output_type: data.outputType,
        style_preset: data.stylePreset?.slice(0, 80) || null,
        prompt_notes: notes,
        quantity: qty,
        status,
        disclosure_label: data.disclosureLabel?.slice(0, 120) || null,
        submitted_at: data.submit ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    await logAudit(userId, "generate.request_created", { type: "generation_request", id: row.id }, { status, outputType: data.outputType, qty });
    return { request: row };
  });

export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; action: "submit" | "cancel" | "mark_generated" | "needs_review" | "approve" | "reject"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    // Load request first so we can re-verify policy on any state change that
    // moves the request forward (submit / approve).
    const { data: existing, error: exErr } = await supabase
      .from("generation_requests")
      .select("id, creator_id, persona_id, pack_id, output_type, status")
      .eq("id", data.id)
      .eq("creator_id", creator.id)
      .single();
    if (exErr) throw exErr;
    if (data.action === "submit" || data.action === "approve") {
      await assertTwinPolicy(supabase, creator.id, existing.output_type as OutputType, existing.persona_id, existing.pack_id);
    }
    const patch: any = {};
    switch (data.action) {
      case "submit": patch.status = "queued"; patch.submitted_at = new Date().toISOString(); break;
      case "cancel": patch.status = "rejected"; patch.reviewed_at = new Date().toISOString(); patch.reviewed_by = userId; patch.reviewer_note = data.note ?? "Cancelled by creator"; break;
      case "mark_generated": patch.status = "generated"; break;
      case "needs_review": patch.status = "needs_review"; break;
      case "approve": patch.status = "approved"; patch.reviewed_at = new Date().toISOString(); patch.reviewed_by = userId; patch.reviewer_note = data.note ?? null; break;
      case "reject": patch.status = "rejected"; patch.reviewed_at = new Date().toISOString(); patch.reviewed_by = userId; patch.reviewer_note = data.note ?? null; break;
      default: throw new Error("Unknown action.");
    }
    const { data: row, error } = await supabase
      .from("generation_requests").update(patch).eq("id", data.id)
      .select("*").single();
    if (error) throw error;
    await logAudit(userId, `generate.${data.action}`, { type: "generation_request", id: row.id }, { note: data.note ?? null });
    return { request: row };
  });

/**
 * Creates placeholder AI-draft assets tied to an approved request and marks
 * the request "published". No real media is generated yet — the assets are
 * empty synthetic drafts awaiting future provider output.
 */
export const publishRequestPlaceholders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: req, error: reqErr } = await supabase
      .from("generation_requests").select("*").eq("id", data.id).eq("creator_id", creator.id).single();
    if (reqErr) throw reqErr;
    if (req.status !== "approved") throw new Error("Only approved requests can be published.");
    // Re-verify policy at publish time so a consent revocation or persona
    // unpublish between approval and publish still blocks synthetic writes.
    const policy = await assertTwinPolicy(supabase, creator.id, req.output_type as OutputType, req.persona_id, req.pack_id);

    const kindMap: Record<string, string> = {
      image: "image", promo_banner: "image",
      audio: "audio",
      video: "video", talking_head: "video",
    };
    const rows: any[] = Array.from({ length: req.quantity }, (_, i) => ({
      creator_id: creator.id,
      title: `AI ${req.output_type.replace("_", " ")} · draft ${i + 1}`,
      asset_type: kindMap[req.output_type] ?? "image",
      is_synthetic: true,
      ai_generated_label: true,
      ai_disclosure_required: true,
      approval_status: "approved",
      source_type: "ai_generated",
      internal_label: "approved_synthetic",
      visibility: "private",
      category: `ai_${req.output_type}`,
    }));
    const { data: inserted, error } = await supabase
      .from("content_assets").insert(rows).select("id");
    if (error) throw error;
    const ids = (inserted ?? []).map((r: any) => r.id);

    // link to pack if provided
    if (req.pack_id && ids.length) {
      const items: any[] = ids.map((asset_id: string, idx: number) => ({ pack_id: req.pack_id, asset_id, position: idx }));
      await supabase.from("content_pack_items").upsert(items, { onConflict: "pack_id,asset_id", ignoreDuplicates: true });
    }
    // link to persona if provided
    if (req.persona_id && ids.length) {
      // Inherit the pack↔persona access level so produced synthetic assets
      // are visible to fans at exactly the same tier the source pack is.
      const inherited = policy.packPermission ?? "included";
      const perms: any[] = ids.map((asset_id: string) => ({ persona_id: req.persona_id, asset_id, permission_type: inherited }));
      await supabase.from("persona_content_permissions").upsert(perms, { onConflict: "persona_id,asset_id" });
    }

    await supabase.from("generation_requests").update({
      status: "published", produced_asset_ids: ids,
    }).eq("id", data.id);
    await logAudit(userId, "generate.published", { type: "generation_request", id: data.id }, { count: ids.length });
    return { count: ids.length };
  });

export const listCreateTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const [{ data: personas }, { data: packs }] = await Promise.all([
      supabase.from("personas").select("id, display_name, slug, kind").eq("creator_id", creator.id).order("sort_order"),
      supabase.from("content_packs").select("id, name, slug, pack_type, status").eq("creator_id", creator.id).order("sort_order"),
    ]);
    return { personas: personas ?? [], packs: packs ?? [] };
  });
