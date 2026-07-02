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
        .select("id, kind, storage_path, mime_type, slot_label, notes, sort_order, created_at, review_status, review_note, submitted_at, reviewed_at, deleted_at")
        .eq("creator_id", creator.id)
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

    const all = refs ?? [];
    return {
      creator,
      consent: consent ?? null,
      voice: voice ?? null,
      refs: all.filter((r: any) => !r.deleted_at),
      archivedRefs: all.filter((r: any) => !!r.deleted_at),
    };
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
    // Soft-delete for version history — creators can restore or hard-delete later.
    const { error } = await supabase
      .from("twin_reference_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id).eq("creator_id", creator.id);
    if (error) throw error;
    // Any personas linking this ref: prune the id (no schema drift needed).
    await supabase.rpc("has_role", { _user_id: userId, _role: "creator" }); // no-op safety
    const { data: personas } = await supabase
      .from("personas").select("id, linked_twin_ref_ids")
      .eq("creator_id", creator.id);
    for (const p of personas ?? []) {
      const ids = ((p as any).linked_twin_ref_ids as string[] | null) ?? [];
      if (ids.includes(data.id)) {
        await supabase.from("personas")
          .update({ linked_twin_ref_ids: ids.filter((i) => i !== data.id) })
          .eq("id", (p as any).id);
      }
    }
    await logAudit(userId, "twin.reference_archived", { type: "creator", id: creator.id }, { kind: row?.kind });
    return { ok: true };
  });

export const restoreTwinReference = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { error } = await supabase
      .from("twin_reference_assets")
      .update({ deleted_at: null })
      .eq("id", data.id).eq("creator_id", creator.id);
    if (error) throw error;
    await logAudit(userId, "twin.reference_restored", { type: "creator", id: creator.id }, {});
    return { ok: true };
  });

export const hardDeleteTwinReference = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    const { data: row } = await supabase
      .from("twin_reference_assets").select("storage_path, kind, deleted_at")
      .eq("id", data.id).eq("creator_id", creator.id).maybeSingle();
    if (!row) throw new Error("Reference not found.");
    if (!row.deleted_at) throw new Error("Archive the reference before permanently deleting it.");
    const { error } = await supabase
      .from("twin_reference_assets").delete()
      .eq("id", data.id).eq("creator_id", creator.id);
    if (error) throw error;
    if (row.storage_path) {
      await supabase.storage.from("content-assets").remove([row.storage_path]).catch(() => undefined);
    }
    await logAudit(userId, "twin.reference_deleted", { type: "creator", id: creator.id }, { kind: row.kind });
    return { ok: true };
  });

export const submitTwinReferencesForReview = createServerFn({ method: "POST" })
  .validator((d: { ids?: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    let q = supabase.from("twin_reference_assets")
      .update({ review_status: "pending", submitted_at: new Date().toISOString(), review_note: null })
      .eq("creator_id", creator.id).is("deleted_at", null)
      .in("review_status", ["draft", "rejected"]);
    if (data.ids && data.ids.length) q = q.in("id", data.ids);
    const { error, data: rows } = await q.select("id");
    if (error) throw error;
    await logAudit(userId, "twin.review_submitted", { type: "creator", id: creator.id }, { count: rows?.length ?? 0 });
    return { submitted: rows?.length ?? 0 };
  });

// ---------- Admin: twin reference review queue ----------

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const adminListPendingTwinRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("twin_reference_assets")
      .select("id, creator_id, kind, storage_path, mime_type, slot_label, notes, submitted_at, review_status")
      .eq("review_status", "pending").is("deleted_at", null)
      .order("submitted_at", { ascending: true }).limit(200);
    if (error) throw error;
    const creatorIds = Array.from(new Set((data ?? []).map((r: any) => r.creator_id)));
    const { data: creators } = creatorIds.length
      ? await supabaseAdmin.from("creators").select("id, handle, stage_name").in("id", creatorIds)
      : { data: [] as any[] };
    const byId = new Map((creators ?? []).map((c: any) => [c.id, c]));
    return { refs: (data ?? []).map((r: any) => ({ ...r, creator: byId.get(r.creator_id) ?? null })) };
  });

export const adminSetTwinRefReview = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: "approved" | "rejected"; note?: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("twin_reference_assets")
      .update({
        review_status: data.status,
        review_note: data.note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      }).eq("id", data.id);
    if (error) throw error;
    await logAudit(context.userId, "admin.twin_ref_review", { type: "twin_reference", id: data.id }, { status: data.status });
    return { ok: true };
  });

export const adminGetTwinRefSignedUrl = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("twin_reference_assets").select("storage_path").eq("id", data.id).maybeSingle();
    if (error || !row) throw error ?? new Error("Not found");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("content-assets").createSignedUrl(row.storage_path, 600);
    if (sErr) throw sErr;
    return { url: signed.signedUrl };
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