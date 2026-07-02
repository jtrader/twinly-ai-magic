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
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
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
    const patch: Record<string, unknown> = {};
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

    const kindMap: Record<string, string> = {
      image: "image", promo_banner: "image",
      audio: "audio",
      video: "video", talking_head: "video",
    };
    const rows = Array.from({ length: req.quantity }, (_, i) => ({
      creator_id: creator.id,
      title: `AI ${req.output_type.replace("_", " ")} · draft ${i + 1}`,
      asset_type: kindMap[req.output_type] ?? "image",
      is_synthetic: true,
      ai_generated_label: true,
      ai_disclosure_required: true,
      approval_status: "approved" as const,
      source_type: "ai_generated" as const,
      internal_label: "approved_synthetic" as const,
      visibility: "private" as const,
      category: `ai_${req.output_type}`,
    }));
    const { data: inserted, error } = await supabase
      .from("content_assets").insert(rows).select("id");
    if (error) throw error;
    const ids = (inserted ?? []).map((r: any) => r.id);

    // link to pack if provided
    if (req.pack_id && ids.length) {
      const items = ids.map((asset_id: string, idx: number) => ({ pack_id: req.pack_id, asset_id, position: idx }));
      await supabase.from("content_pack_items").upsert(items, { onConflict: "pack_id,asset_id", ignoreDuplicates: true });
    }
    // link to persona if provided
    if (req.persona_id && ids.length) {
      const perms = ids.map((asset_id: string) => ({ persona_id: req.persona_id, asset_id, permission_type: "included" as const }));
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
