import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type TwinKind = "identity_ref" | "voice_ref" | "style_ref";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators")
    .select("id, handle, stage_name, digital_twin_status, style_notes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Create your creator profile first.");
  return data as {
    id: string; handle: string; stage_name: string;
    digital_twin_status: string; style_notes: any;
  };
}

export const getTwinProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const [{ data: consent }, { data: voice }, { data: refs }] = await Promise.all([
      supabase.from("digital_twin_consent")
        .select("creator_id, likeness_ok, voice_ok, image_ok, video_ok, allowed_uses, forbidden_uses, signed_at, revoked_at, updated_at")
        .eq("creator_id", creator.id).maybeSingle(),
      supabase.from("creator_voice_profiles")
        .select("tone_summary, sales_style, approved_phrases, banned_phrases")
        .eq("creator_id", creator.id).maybeSingle(),
      supabase.from("twin_reference_assets")
        .select("id, kind, storage_path, mime_type, slot_label, notes, sort_order, created_at")
        .eq("creator_id", creator.id)
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

    return { creator, consent: consent ?? null, voice: voice ?? null, refs: refs ?? [] };
  });

export const addTwinReference = createServerFn({ method: "POST" })
  .validator((d: { kind: TwinKind; storagePath: string; mimeType?: string; slotLabel?: string; notes?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    if (!data.storagePath.startsWith(`${creator.id}/`)) {
      throw new Error("Storage path not owned by this creator.");
    }
    const { data: max } = await supabase
      .from("twin_reference_assets").select("sort_order")
      .eq("creator_id", creator.id).eq("kind", data.kind)
      .order("sort_order", { ascending: false }).limit(1);
    const nextOrder = ((max?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { data: row, error } = await supabase
      .from("twin_reference_assets")
      .insert({
        creator_id: creator.id,
        kind: data.kind,
        storage_path: data.storagePath,
        mime_type: data.mimeType ?? null,
        slot_label: data.slotLabel?.trim() || null,
        notes: data.notes?.trim() || null,
        sort_order: nextOrder,
      }).select().single();
    if (error) throw error;
    await logAudit(userId, "twin.reference_added", { type: "creator", id: creator.id }, { kind: data.kind });
    return row;
  });

export const updateTwinReference = createServerFn({ method: "POST" })
  .validator((d: { id: string; slotLabel?: string; notes?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { error } = await supabase
      .from("twin_reference_assets")
      .update({
        slot_label: data.slotLabel?.trim() || null,
        notes: data.notes?.trim() || null,
      })
      .eq("id", data.id).eq("creator_id", creator.id);
    if (error) throw error;
    return { ok: true };
  });

export const removeTwinReference = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: row } = await supabase
      .from("twin_reference_assets").select("storage_path, kind")
      .eq("id", data.id).eq("creator_id", creator.id).maybeSingle();
    const { error } = await supabase
      .from("twin_reference_assets")
      .delete().eq("id", data.id).eq("creator_id", creator.id);
    if (error) throw error;
    if (row?.storage_path) {
      await supabase.storage.from("content-assets").remove([row.storage_path]).catch(() => undefined);
    }
    await logAudit(userId, "twin.reference_removed", { type: "creator", id: creator.id }, { kind: row?.kind });
    return { ok: true };
  });

export const upsertTwinConsent = createServerFn({ method: "POST" })
  .validator((d: {
    likenessOk?: boolean; voiceOk?: boolean; imageOk?: boolean; videoOk?: boolean;
    allowedUses?: Record<string, boolean>;
    forbiddenUses?: { presets?: Record<string, boolean>; custom?: string[] };
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const patch: any = { creator_id: creator.id, updated_at: new Date().toISOString() };
    if (data.likenessOk !== undefined) patch.likeness_ok = data.likenessOk;
    if (data.voiceOk !== undefined) patch.voice_ok = data.voiceOk;
    if (data.imageOk !== undefined) patch.image_ok = data.imageOk;
    if (data.videoOk !== undefined) patch.video_ok = data.videoOk;
    if (data.allowedUses) patch.allowed_uses = data.allowedUses;
    if (data.forbiddenUses) patch.forbidden_uses = data.forbiddenUses;

    const { error } = await supabase
      .from("digital_twin_consent")
      .upsert(patch, { onConflict: "creator_id" });
    if (error) throw error;
    await logAudit(userId, "twin.consent_updated", { type: "creator", id: creator.id }, {
      keys: Object.keys(patch).filter((k) => k !== "creator_id" && k !== "updated_at"),
    });
    return { ok: true };
  });

export const revokeTwinConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const now = new Date().toISOString();
    const { error: cErr } = await supabase
      .from("digital_twin_consent")
      .update({ revoked_at: now, likeness_ok: false, voice_ok: false, image_ok: false, video_ok: false })
      .eq("creator_id", creator.id);
    if (cErr) throw cErr;
    await supabase.from("creators").update({ digital_twin_status: "revoked" }).eq("id", creator.id);
    await logAudit(userId, "twin.consent_revoked", { type: "creator", id: creator.id }, {});
    return { ok: true };
  });

export const upsertStyleNotes = createServerFn({ method: "POST" })
  .validator((d: { notes: Record<string, string> }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { error } = await supabase
      .from("creators").update({ style_notes: data.notes ?? {} }).eq("id", creator.id);
    if (error) throw error;
    await logAudit(userId, "twin.style_updated", { type: "creator", id: creator.id }, {});
    return { ok: true };
  });

export const getTwinRefSignedUrl = createServerFn({ method: "POST" })
  .validator((d: { storagePath: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("content-assets")
      .createSignedUrl(data.storagePath, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  });