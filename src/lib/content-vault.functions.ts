import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

type AssetType = "image" | "video" | "audio" | "text";
type PermissionType = "included" | "ppv" | "restricted";

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string };
}

export const listVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: assets, error } = await supabase
      .from("content_assets")
      .select("id, title, asset_type, category, storage_path, external_url, is_synthetic, ai_generated_label, approval_status, moderation_status, consent_status, price_cents, created_at")
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

    return {
      creator,
      assets: assets ?? [],
      permissions,
      personas: personas ?? [],
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
      })
      .select("*").single();
    if (error) throw error;

    if (data.attachPersonaIds?.length) {
      const permission = data.permissionType ?? "included";
      const rows = data.attachPersonaIds.map((persona_id) => ({
        persona_id, asset_id: asset.id, permission_type: permission,
      }));
      const { error: linkErr } = await supabase
        .from("persona_content_permissions").insert(rows);
      if (linkErr) throw linkErr;
    }

    await logAudit(userId, "asset.created", { type: "asset", id: asset.id }, {
      type: data.assetType, synthetic: !!data.isSynthetic,
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
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
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
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await context.supabase
      .from("content_assets").update(patch).eq("id", data.assetId);
    if (error) throw error;
    await logAudit(context.userId, "asset.updated", { type: "asset", id: data.assetId }, { fields: Object.keys(patch) });
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
};

export const bulkCreateAssets = createServerFn({ method: "POST" })
  .validator((d: {
    items: BulkItem[];
    attachPersonaIds?: string[];
    permissionType?: PermissionType;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    if (!data.items?.length) throw new Error("No files to import.");
    if (data.items.length > 50) throw new Error("Import up to 50 files at a time.");

    const rows = data.items.map((it) => {
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
      };
    });

    const { data: inserted, error } = await supabase
      .from("content_assets").insert(rows).select("id");
    if (error) throw error;

    const permission = data.permissionType ?? "included";
    if (data.attachPersonaIds?.length && inserted?.length) {
      const links: any[] = [];
      for (const a of inserted) {
        for (const persona_id of data.attachPersonaIds) {
          links.push({ asset_id: a.id, persona_id, permission_type: permission });
        }
      }
      const { error: linkErr } = await supabase
        .from("persona_content_permissions").insert(links);
      if (linkErr) throw linkErr;
    }

    await logAudit(userId, "asset.bulk_created", { type: "creator", id: creator.id }, {
      count: inserted?.length ?? 0,
      attached_personas: data.attachPersonaIds ?? [],
      permission,
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