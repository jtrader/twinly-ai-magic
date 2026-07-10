import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type AssetType = "image" | "video" | "audio" | "text";
type PermissionType = "included" | "ppv" | "restricted";

export const PERSONA_STORAGE_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string };
}

/**
 * Resolves the real object size from Supabase Storage (source of truth) so a
 * creator can't inflate/deflate their own quota by lying about `file.size`.
 * Falls back to the client-declared size if the storage lookup fails —
 * uploads should not hard-fail on a metadata read hiccup.
 */
async function resolveByteSize(storagePath: string | null | undefined, declaredSize?: number): Promise<number> {
  if (!storagePath) return 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idx = storagePath.lastIndexOf("/");
    const dir = idx >= 0 ? storagePath.slice(0, idx) : "";
    const name = idx >= 0 ? storagePath.slice(idx + 1) : storagePath;
    const { data } = await supabaseAdmin.storage.from("content-assets").list(dir, { search: name, limit: 1 });
    const found = data?.find((f: any) => f.name === name);
    const metaSize = found?.metadata?.size;
    if (typeof metaSize === "number") return metaSize;
  } catch {
    // fall through to declared size
  }
  return Math.max(0, Math.floor(declaredSize ?? 0));
}

/** Every asset_id visible to a persona via direct link OR an attached pack. */
async function personaAssetIds(supabase: any, personaId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: direct } = await supabase
    .from("persona_content_permissions").select("asset_id").eq("persona_id", personaId);
  for (const r of direct ?? []) ids.add(r.asset_id);

  const { data: packLinks } = await supabase
    .from("content_pack_personas").select("pack_id").eq("persona_id", personaId);
  const packIds = (packLinks ?? []).map((r: any) => r.pack_id);
  if (packIds.length) {
    const { data: items } = await supabase
      .from("content_pack_items").select("asset_id").in("pack_id", packIds);
    for (const r of items ?? []) ids.add(r.asset_id);
  }
  return ids;
}

/** Sum of byte_size for a persona's own (non-globally-shared) library. */
export async function getPersonaStorageUsageBytes(supabase: any, personaId: string): Promise<number> {
  const ids = await personaAssetIds(supabase, personaId);
  if (ids.size === 0) return 0;
  const { data: assets } = await supabase
    .from("content_assets")
    .select("byte_size, shared_across_personas")
    .in("id", Array.from(ids));
  return (assets ?? [])
    .filter((a: any) => !a.shared_across_personas)
    .reduce((sum: number, a: any) => sum + (a.byte_size ?? 0), 0);
}

async function assertPersonaHasRoom(supabase: any, personaId: string, additionalBytes: number) {
  if (additionalBytes <= 0) return;
  const used = await getPersonaStorageUsageBytes(supabase, personaId);
  if (used + additionalBytes > PERSONA_STORAGE_CAP_BYTES) {
    const { data: persona } = await supabase.from("personas").select("display_name").eq("id", personaId).maybeSingle();
    const remainingMb = Math.max(0, (PERSONA_STORAGE_CAP_BYTES - used) / (1024 * 1024));
    throw new Error(
      `"${persona?.display_name ?? "This persona"}" only has ${remainingMb.toFixed(0)} MB of its 5 GB library left. Mark this asset as shared globally, remove other files, or attach it to a persona with more room.`,
    );
  }
}

export const listVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: assets, error } = await supabase
      .from("content_assets")
      .select("id, title, asset_type, category, storage_path, external_url, is_synthetic, ai_generated_label, approval_status, moderation_status, consent_status, price_cents, byte_size, shared_across_personas, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (assets ?? []).map((a: any) => a.id);
    let permissions: any[] = [];
    if (ids.length) {
      const { data: perms, error: pErr } = await supabase
        .from("persona_content_permissions")
        .select("asset_id, persona_id, permission_type")
        .in("asset_id", ids);
      if (pErr) throw pErr;
      permissions = perms ?? [];
    }

    const { data: personas } = await supabase
      .from("personas")
      .select("id, slug, display_name, kind, sort_order, visibility")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: true });

    // Per-persona storage usage: direct links + pack-attached assets,
    // excluding globally-shared ones (they live outside any persona's cap).
    const byteSizeByAsset = new Map((assets ?? []).map((a: any) => [a.id, a.shared_across_personas ? 0 : (a.byte_size ?? 0)]));
    const { data: packPersonaLinks } = await supabase
      .from("content_pack_personas").select("pack_id, persona_id")
      .in("persona_id", (personas ?? []).map((p: any) => p.id).length ? (personas ?? []).map((p: any) => p.id) : ["00000000-0000-0000-0000-000000000000"]);
    const packIds = [...new Set((packPersonaLinks ?? []).map((r: any) => r.pack_id))];
    let packItemsByPack = new Map<string, string[]>();
    if (packIds.length) {
      const { data: packItems } = await supabase
        .from("content_pack_items").select("pack_id, asset_id").in("pack_id", packIds);
      for (const r of packItems ?? []) {
        if (!packItemsByPack.has(r.pack_id)) packItemsByPack.set(r.pack_id, []);
        packItemsByPack.get(r.pack_id)!.push(r.asset_id);
      }
    }
    const storageSummary = (personas ?? []).map((p: any) => {
      const assetIds = new Set<string>();
      for (const perm of permissions) if (perm.persona_id === p.id) assetIds.add(perm.asset_id);
      for (const link of packPersonaLinks ?? []) {
        if (link.persona_id !== p.id) continue;
        for (const assetId of packItemsByPack.get(link.pack_id) ?? []) assetIds.add(assetId);
      }
      const usedBytes = Array.from(assetIds).reduce((sum, id) => sum + (byteSizeByAsset.get(id) ?? 0), 0);
      return { personaId: p.id, usedBytes, capBytes: PERSONA_STORAGE_CAP_BYTES };
    });

    return {
      creator,
      assets: assets ?? [],
      permissions,
      personas: personas ?? [],
      storageSummary,
    };
  });

export const createAsset = createServerFn({ method: "POST" })
  .validator((d: {
    title: string;
    assetType: AssetType;
    storagePath?: string;
    externalUrl?: string;
    category?: string;
    isSynthetic?: boolean;
    aiGeneratedLabel?: boolean;
    priceCents?: number;
    byteSize?: number;
    sharedAcrossPersonas?: boolean;
    attachPersonaIds?: string[];
    permissionType?: PermissionType;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const title = data.title.trim();
    if (title.length < 1 || title.length > 120) throw new Error("Title must be 1–120 characters.");
    if (!data.storagePath && !data.externalUrl) throw new Error("Upload a file or provide an external URL.");

    // Storage path must be scoped to this creator (RLS also enforces this).
    if (data.storagePath && !data.storagePath.startsWith(`${creator.id}/`)) {
      throw new Error("Storage path is not owned by this creator.");
    }

    const byteSize = await resolveByteSize(data.storagePath, data.byteSize);
    const shared = !!data.sharedAcrossPersonas;
    const attachTo = shared ? [] : (data.attachPersonaIds ?? []);

    // Enforce the 5GB-per-persona cap before writing anything, so a rejected
    // upload never leaves an orphaned asset row behind.
    for (const personaId of attachTo) {
      await assertPersonaHasRoom(supabase, personaId, byteSize);
    }

    const { data: asset, error } = await supabase
      .from("content_assets")
      .insert({
        creator_id: creator.id,
        title,
        asset_type: data.assetType,
        storage_path: data.storagePath ?? null,
        external_url: data.externalUrl ?? null,
        category: data.category?.trim() || null,
        is_synthetic: !!data.isSynthetic,
        ai_generated_label: data.aiGeneratedLabel ?? !!data.isSynthetic,
        price_cents: Math.max(0, Math.floor(data.priceCents ?? 0)),
        byte_size: byteSize || null,
        shared_across_personas: shared,
      })
      .select("*").single();
    if (error) throw error;

    if (attachTo.length) {
      const permission = data.permissionType ?? "included";
      const rows = attachTo.map((persona_id) => ({
        persona_id, asset_id: asset.id, permission_type: permission,
      }));
      const { error: linkErr } = await supabase
        .from("persona_content_permissions").insert(rows);
      if (linkErr) throw linkErr;
    }

    await logAudit(userId, "asset.created", { type: "asset", id: asset.id }, {
      type: data.assetType, synthetic: !!data.isSynthetic, shared,
    });
    return { asset };
  });

export const updateAsset = createServerFn({ method: "POST" })
  .validator((d: {
    assetId: string;
    title?: string;
    category?: string;
    isSynthetic?: boolean;
    aiGeneratedLabel?: boolean;
    priceCents?: number;
    sharedAcrossPersonas?: boolean;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.title !== undefined) {
      const v = data.title.trim();
      if (v.length < 1 || v.length > 120) throw new Error("Title must be 1–120 characters.");
      patch.title = v;
    }
    if (data.category !== undefined) patch.category = data.category.trim() || null;
    if (data.isSynthetic !== undefined) patch.is_synthetic = !!data.isSynthetic;
    if (data.aiGeneratedLabel !== undefined) patch.ai_generated_label = !!data.aiGeneratedLabel;
    if (data.priceCents !== undefined) patch.price_cents = Math.max(0, Math.floor(data.priceCents));
    if (data.sharedAcrossPersonas !== undefined) patch.shared_across_personas = !!data.sharedAcrossPersonas;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await supabase
      .from("content_assets").update(patch).eq("id", data.assetId);
    if (error) throw error;

    // Sharing globally supersedes direct persona attachments — clear them so
    // the vault UI doesn't show stale per-persona switches for a shared item.
    if (data.sharedAcrossPersonas === true) {
      await supabase.from("persona_content_permissions").delete().eq("asset_id", data.assetId);
    }

    await logAudit(userId, "asset.updated", { type: "asset", id: data.assetId }, { fields: Object.keys(patch) });
    return { ok: true };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .validator((d: { assetId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: asset, error: readErr } = await supabase
      .from("content_assets").select("id, storage_path, creator_id").eq("id", data.assetId).maybeSingle();
    if (readErr) throw readErr;
    if (!asset) throw new Error("Asset not found.");

    if (asset.storage_path) {
      const { error: rmErr } = await supabase.storage
        .from("content-assets").remove([asset.storage_path]);
      if (rmErr && !`${rmErr.message}`.includes("not found")) throw rmErr;
    }
    const { error } = await supabase.from("content_assets").delete().eq("id", data.assetId);
    if (error) throw error;
    await logAudit(userId, "asset.deleted", { type: "asset", id: data.assetId }, {});
    return { ok: true };
  });

// Creator submits a synthetic asset for admin review.
export const submitAssetForReview = createServerFn({ method: "POST" })
  .validator((d: { assetId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("content_assets")
      .update({ approval_status: "pending" })
      .eq("id", data.assetId);
    if (error) throw error;
    await logAudit(userId, "asset.review_submitted", { type: "asset", id: data.assetId }, {});
    return { ok: true, approval_status: "pending" };
  });

export const setAssetPersonaPermission = createServerFn({ method: "POST" })
  .validator((d: { assetId: string; personaId: string; permissionType: PermissionType }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only check quota for a genuinely NEW attachment — changing an existing
    // permission_type doesn't add any new storage.
    const { data: existing } = await supabase
      .from("persona_content_permissions")
      .select("persona_id")
      .eq("asset_id", data.assetId).eq("persona_id", data.personaId)
      .maybeSingle();
    if (!existing) {
      const { data: asset } = await supabase
        .from("content_assets").select("byte_size, shared_across_personas").eq("id", data.assetId).maybeSingle();
      if (asset && !asset.shared_across_personas) {
        await assertPersonaHasRoom(supabase, data.personaId, asset.byte_size ?? 0);
      }
    }

    const { error } = await supabase
      .from("persona_content_permissions")
      .upsert(
        { asset_id: data.assetId, persona_id: data.personaId, permission_type: data.permissionType },
        { onConflict: "persona_id,asset_id" },
      );
    if (error) throw error;
    await logAudit(userId, "asset.permission_set", { type: "asset", id: data.assetId }, {
      persona: data.personaId, permission: data.permissionType,
    });
    return { ok: true };
  });

export const removeAssetFromPersona = createServerFn({ method: "POST" })
  .validator((d: { assetId: string; personaId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("persona_content_permissions")
      .delete()
      .eq("asset_id", data.assetId)
      .eq("persona_id", data.personaId);
    if (error) throw error;
    await logAudit(context.userId, "asset.permission_removed", { type: "asset", id: data.assetId }, {
      persona: data.personaId,
    });
    return { ok: true };
  });

export const getAssetSignedUrl = createServerFn({ method: "POST" })
  .validator((d: { storagePath: string; expiresIn?: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("content-assets")
      .createSignedUrl(data.storagePath, Math.min(3600, Math.max(30, data.expiresIn ?? 600)));
    if (error) throw error;
    return { url: signed.signedUrl };
  });

type BulkItem = {
  title: string;
  assetType: AssetType;
  storagePath?: string;
  externalUrl?: string;
  category?: string;
  isSynthetic?: boolean;
  byteSize?: number;
};

export const bulkCreateAssets = createServerFn({ method: "POST" })
  .validator((d: {
    items: BulkItem[];
    attachPersonaIds?: string[];
    permissionType?: PermissionType;
    sharedAcrossPersonas?: boolean;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    if (!data.items?.length) throw new Error("No files to import.");
    if (data.items.length > 50) throw new Error("Import up to 50 files at a time.");

    const shared = !!data.sharedAcrossPersonas;
    const attachTo = shared ? [] : (data.attachPersonaIds ?? []);

    const byteSizes = await Promise.all(
      data.items.map((it) => resolveByteSize(it.storagePath, it.byteSize)),
    );
    const totalBytes = byteSizes.reduce((s, b) => s + b, 0);
    for (const personaId of attachTo) {
      await assertPersonaHasRoom(supabase, personaId, totalBytes);
    }

    const rows = data.items.map((it, i) => {
      const title = (it.title ?? "").trim();
      if (title.length < 1 || title.length > 120) throw new Error(`Invalid title: "${it.title}"`);
      if (!it.storagePath && !it.externalUrl) throw new Error(`Missing source for "${title}"`);
      if (it.storagePath && !it.storagePath.startsWith(`${creator.id}/`)) {
        throw new Error("Storage path not owned by this creator.");
      }
      return {
        creator_id: creator.id,
        title,
        asset_type: it.assetType,
        storage_path: it.storagePath ?? null,
        external_url: it.externalUrl ?? null,
        category: it.category?.trim() || null,
        is_synthetic: !!it.isSynthetic,
        ai_generated_label: !!it.isSynthetic,
        byte_size: byteSizes[i] || null,
        shared_across_personas: shared,
      };
    });

    const { data: inserted, error } = await supabase
      .from("content_assets").insert(rows).select("id");
    if (error) throw error;

    const permission = data.permissionType ?? "included";
    if (attachTo.length && inserted?.length) {
      const links: any[] = [];
      for (const a of inserted) {
        for (const persona_id of attachTo) {
          links.push({ asset_id: a.id, persona_id, permission_type: permission });
        }
      }
      const { error: linkErr } = await supabase
        .from("persona_content_permissions").insert(links);
      if (linkErr) throw linkErr;
    }

    await logAudit(userId, "asset.bulk_created", { type: "creator", id: creator.id }, {
      count: inserted?.length ?? 0,
      attached_personas: attachTo,
      permission,
      shared,
    });
    return { count: inserted?.length ?? 0 };
  });

export const listAssetAudit = createServerFn({ method: "POST" })
  .validator((d: { assetId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Verify caller owns this asset before returning the log.
    const { data: asset, error: aerr } = await supabase
      .from("content_assets").select("id, creator_id, title, created_at")
      .eq("id", data.assetId).maybeSingle();
    if (aerr) throw aerr;
    if (!asset) throw new Error("Asset not found.");

    // audit_logs is admin-RLS; ownership was just verified via user-scoped read.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entries, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, metadata, created_at, actor_user_id")
      .eq("subject_type", "asset")
      .eq("subject_id", data.assetId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { entries: entries ?? [], asset };
  });