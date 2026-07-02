import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type PackType = "nice" | "naughty" | "wicked" | "seasonal" | "custom";
type PackStatus = "draft" | "in_review" | "approved" | "rejected" | "archived";
type PermissionType = "included" | "ppv" | "restricted";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Create your creator profile first.");
  return data as { id: string; handle: string };
}

function slugify(name: string) {
  return name
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "pack";
}

function normalizeTags(tags?: string[] | null): string[] {
  if (!tags?.length) return [];
  const cleaned = tags
    .map((t) => `${t ?? ""}`.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32))
    .filter((t) => t.length > 0 && /^[a-z0-9][a-z0-9-]*$/.test(t));
  return Array.from(new Set(cleaned)).slice(0, 20);
}

export const listPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: packs, error } = await supabase
      .from("content_packs")
      .select("id, name, slug, pack_type, description, cover_asset_id, status, starts_at, ends_at, sort_order, review_note, review_feedback, reviewed_at, tags, created_at, updated_at")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const packIds = (packs ?? []).map((p: any) => p.id);
    let items: any[] = [];
    let attach: any[] = [];
    if (packIds.length) {
      const [{ data: i }, { data: a }] = await Promise.all([
        supabase.from("content_pack_items").select("pack_id, asset_id").in("pack_id", packIds),
        supabase.from("content_pack_personas").select("pack_id, persona_id, permission_type").in("pack_id", packIds),
      ]);
      items = i ?? [];
      attach = a ?? [];
    }
    const { data: personas } = await supabase
      .from("personas")
      .select("id, slug, display_name, kind, sort_order")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true });

    // Also surface asset tags in the summary so filter chips work across packs
    const { data: assetTagRows } = await supabase
      .from("content_assets").select("id, tags").eq("creator_id", creator.id);
    return { creator, packs: packs ?? [], items, attach, personas: personas ?? [], assetTags: assetTagRows ?? [] };
  });

export const getPack = createServerFn({ method: "POST" })
  .validator((d: { packId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: pack, error } = await supabase
      .from("content_packs")
      .select("*")
      .eq("id", data.packId)
      .eq("creator_id", creator.id)
      .maybeSingle();
    if (error) throw error;
    if (!pack) throw new Error("Pack not found.");

    const [itemsRes, attachRes, personasRes, assetsRes] = await Promise.all([
      supabase.from("content_pack_items").select("asset_id, position, added_at").eq("pack_id", pack.id).order("position", { ascending: true }),
      supabase.from("content_pack_personas").select("persona_id, permission_type, attached_at").eq("pack_id", pack.id),
      supabase.from("personas").select("id, slug, display_name, kind, sort_order").eq("creator_id", creator.id).order("sort_order"),
      supabase.from("content_assets").select("id, title, asset_type, storage_path, external_url, is_synthetic, ai_generated_label, approval_status, moderation_status, category, tags, created_at").eq("creator_id", creator.id).order("created_at", { ascending: false }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (attachRes.error) throw attachRes.error;
    if (assetsRes.error) throw assetsRes.error;

    return {
      creator,
      pack,
      items: itemsRes.data ?? [],
      attach: attachRes.data ?? [],
      personas: personasRes.data ?? [],
      vault: assetsRes.data ?? [],
    };
  });

export const createPack = createServerFn({ method: "POST" })
  .validator((d: { name: string; packType: PackType; description?: string; startsAt?: string | null; endsAt?: string | null; tags?: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const name = data.name.trim();
    if (name.length < 1 || name.length > 80) throw new Error("Name must be 1–80 characters.");

    // Ensure a unique slug per creator
    const base = slugify(name);
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: existing } = await supabase
        .from("content_packs").select("id").eq("creator_id", creator.id).eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${i}`;
    }

    const { data: pack, error } = await supabase
      .from("content_packs")
      .insert({
        creator_id: creator.id,
        name,
        slug,
        pack_type: data.packType,
        description: data.description?.trim() || null,
        starts_at: data.startsAt || null,
        ends_at: data.endsAt || null,
        tags: normalizeTags(data.tags),
      })
      .select("*").single();
    if (error) throw error;

    await logAudit(userId, "pack.created", { type: "pack", id: pack.id }, { name, packType: data.packType });
    return { pack };
  });

export const updatePack = createServerFn({ method: "POST" })
  .validator((d: {
    packId: string;
    name?: string;
    packType?: PackType;
    description?: string;
    coverAssetId?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    tags?: string[];
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.name !== undefined) {
      const v = data.name.trim();
      if (v.length < 1 || v.length > 80) throw new Error("Name must be 1–80 characters.");
      patch.name = v;
    }
    if (data.packType !== undefined) patch.pack_type = data.packType;
    if (data.description !== undefined) patch.description = data.description.trim() || null;
    if (data.coverAssetId !== undefined) patch.cover_asset_id = data.coverAssetId || null;
    if (data.startsAt !== undefined) patch.starts_at = data.startsAt || null;
    if (data.endsAt !== undefined) patch.ends_at = data.endsAt || null;
    if (data.tags !== undefined) patch.tags = normalizeTags(data.tags);
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase.from("content_packs").update(patch).eq("id", data.packId);
    if (error) throw error;
    await logAudit(context.userId, "pack.updated", { type: "pack", id: data.packId }, { fields: Object.keys(patch) });
    return { ok: true };
  });

export const deletePack = createServerFn({ method: "POST" })
  .validator((d: { packId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: items } = await supabase.from("content_pack_items").select("asset_id").eq("pack_id", data.packId).limit(1);
    if (items && items.length > 0) {
      const { error } = await supabase.from("content_packs").update({ status: "archived" }).eq("id", data.packId);
      if (error) throw error;
      await logAudit(userId, "pack.archived", { type: "pack", id: data.packId }, {});
      return { ok: true, archived: true };
    }
    const { error } = await supabase.from("content_packs").delete().eq("id", data.packId);
    if (error) throw error;
    await logAudit(userId, "pack.deleted", { type: "pack", id: data.packId }, {});
    return { ok: true, archived: false };
  });

export const addAssetsToPack = createServerFn({ method: "POST" })
  .validator((d: { packId: string; assetIds: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (!data.assetIds?.length) return { added: 0 };
    const { data: max } = await context.supabase
      .from("content_pack_items").select("position").eq("pack_id", data.packId)
      .order("position", { ascending: false }).limit(1);
    let pos = (max?.[0]?.position ?? -1) + 1;
    const rows = data.assetIds.map((asset_id) => ({ pack_id: data.packId, asset_id, position: pos++ }));
    const { error } = await context.supabase
      .from("content_pack_items")
      .upsert(rows, { onConflict: "pack_id,asset_id", ignoreDuplicates: true });
    if (error) throw error;

    // Fan-out to persona permissions for currently attached personas
    const { data: attach } = await context.supabase
      .from("content_pack_personas").select("persona_id, permission_type").eq("pack_id", data.packId);
    if (attach?.length) {
      const links: any[] = [];
      for (const a of attach) {
        for (const asset_id of data.assetIds) {
          links.push({ asset_id, persona_id: a.persona_id, permission_type: a.permission_type });
        }
      }
      if (links.length) {
        await context.supabase.from("persona_content_permissions").upsert(links, { onConflict: "persona_id,asset_id" });
      }
    }

    await logAudit(context.userId, "pack.assets_added", { type: "pack", id: data.packId }, { count: data.assetIds.length });
    return { added: data.assetIds.length };
  });

export const removeAssetsFromPack = createServerFn({ method: "POST" })
  .validator((d: { packId: string; assetIds: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (!data.assetIds?.length) return { removed: 0 };
    const { error } = await context.supabase
      .from("content_pack_items").delete()
      .eq("pack_id", data.packId).in("asset_id", data.assetIds);
    if (error) throw error;
    await logAudit(context.userId, "pack.assets_removed", { type: "pack", id: data.packId }, { count: data.assetIds.length });
    return { removed: data.assetIds.length };
  });

export const reorderPackItems = createServerFn({ method: "POST" })
  .validator((d: { packId: string; orderedAssetIds: string[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const rows = data.orderedAssetIds.map((asset_id, idx) => ({ pack_id: data.packId, asset_id, position: idx }));
    if (!rows.length) return { ok: true };
    const { error } = await context.supabase
      .from("content_pack_items").upsert(rows, { onConflict: "pack_id,asset_id" });
    if (error) throw error;
    return { ok: true };
  });

export const attachPackToPersona = createServerFn({ method: "POST" })
  .validator((d: { packId: string; personaId: string; permissionType?: PermissionType }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const permission = data.permissionType ?? "included";
    const { error } = await context.supabase
      .from("content_pack_personas")
      .upsert({ pack_id: data.packId, persona_id: data.personaId, permission_type: permission }, { onConflict: "pack_id,persona_id" });
    if (error) throw error;

    // Fan-out: add this permission to every asset in the pack
    const { data: items } = await context.supabase
      .from("content_pack_items").select("asset_id").eq("pack_id", data.packId);
    if (items?.length) {
      const links = items.map((it: any) => ({ asset_id: it.asset_id, persona_id: data.personaId, permission_type: permission }));
      await context.supabase.from("persona_content_permissions").upsert(links, { onConflict: "persona_id,asset_id" });
    }

    await logAudit(context.userId, "pack.persona_attached", { type: "pack", id: data.packId }, { persona: data.personaId, permission });
    return { ok: true };
  });

export const detachPackFromPersona = createServerFn({ method: "POST" })
  .validator((d: { packId: string; personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // Remove attach record
    const { error } = await context.supabase
      .from("content_pack_personas").delete()
      .eq("pack_id", data.packId).eq("persona_id", data.personaId);
    if (error) throw error;

    // Remove permissions for assets in this pack — but only those still exclusively linked via this pack.
    // Simple approach: remove per-asset persona permissions for all pack items on this persona.
    const { data: items } = await context.supabase
      .from("content_pack_items").select("asset_id").eq("pack_id", data.packId);
    const ids = (items ?? []).map((i: any) => i.asset_id);
    if (ids.length) {
      await context.supabase.from("persona_content_permissions")
        .delete().eq("persona_id", data.personaId).in("asset_id", ids);
    }

    await logAudit(context.userId, "pack.persona_detached", { type: "pack", id: data.packId }, { persona: data.personaId });
    return { ok: true };
  });

export const submitPackForReview = createServerFn({ method: "POST" })
  .validator((d: { packId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_packs").update({ status: "in_review", review_note: null }).eq("id", data.packId);
    if (error) throw error;
    await logAudit(context.userId, "pack.submitted_for_review", { type: "pack", id: data.packId }, {});
    return { ok: true, status: "in_review" as PackStatus };
  });

export const listPackAudit = createServerFn({ method: "POST" })
  .validator((d: { packId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: pack, error: perr } = await context.supabase
      .from("content_packs").select("id, name, creator_id").eq("id", data.packId).maybeSingle();
    if (perr) throw perr;
    if (!pack) throw new Error("Pack not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entries, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, metadata, created_at, actor_user_id")
      .eq("subject_type", "pack").eq("subject_id", data.packId)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return { entries: entries ?? [], pack };
  });

type BulkPackItem = {
  title: string;
  assetType: "image" | "video" | "audio" | "text";
  storagePath: string;
  category?: string;
  isSynthetic?: boolean;
};

// Create assets in the vault and add them all to a pack in one call.
export const bulkUploadToPack = createServerFn({ method: "POST" })
  .validator((d: { packId: string; items: BulkPackItem[] }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    if (!data.items?.length) throw new Error("No files to import.");
    if (data.items.length > 50) throw new Error("Import up to 50 files at a time.");

    // Verify pack ownership
    const { data: pack, error: perr } = await supabase
      .from("content_packs").select("id").eq("id", data.packId).eq("creator_id", creator.id).maybeSingle();
    if (perr) throw perr;
    if (!pack) throw new Error("Pack not found.");

    const rows = data.items.map((it) => {
      const title = it.title.trim();
      if (title.length < 1 || title.length > 120) throw new Error(`Invalid title: "${it.title}"`);
      if (!it.storagePath.startsWith(`${creator.id}/`)) throw new Error("Storage path not owned by this creator.");
      return {
        creator_id: creator.id,
        title,
        asset_type: it.assetType,
        storage_path: it.storagePath,
        category: it.category?.trim() || null,
        is_synthetic: !!it.isSynthetic,
        ai_generated_label: !!it.isSynthetic,
      };
    });

    const { data: inserted, error } = await supabase
      .from("content_assets").insert(rows).select("id");
    if (error) throw error;

    const { data: max } = await supabase
      .from("content_pack_items").select("position").eq("pack_id", data.packId)
      .order("position", { ascending: false }).limit(1);
    let pos = (max?.[0]?.position ?? -1) + 1;
    const itemRows = (inserted ?? []).map((a: any) => ({ pack_id: data.packId, asset_id: a.id, position: pos++ }));
    if (itemRows.length) {
      const { error: iErr } = await supabase.from("content_pack_items").insert(itemRows);
      if (iErr) throw iErr;
    }

    // Fan-out to attached personas
    const { data: attach } = await supabase
      .from("content_pack_personas").select("persona_id, permission_type").eq("pack_id", data.packId);
    if (attach?.length && inserted?.length) {
      const links: any[] = [];
      for (const a of attach) {
        for (const asset of inserted) {
          links.push({ asset_id: asset.id, persona_id: a.persona_id, permission_type: a.permission_type });
        }
      }
      if (links.length) {
        await supabase.from("persona_content_permissions").upsert(links, { onConflict: "persona_id,asset_id" });
      }
    }

    await logAudit(userId, "pack.bulk_uploaded", { type: "pack", id: data.packId }, { count: inserted?.length ?? 0 });
    return { count: inserted?.length ?? 0 };
  });