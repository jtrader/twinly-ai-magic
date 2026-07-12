import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

/** Pure — a record is overdue when it's never been reviewed, or its next_review_due date has passed. */
export function isReviewOverdue(record: { reviewed_at: string | null; next_review_due: string }, now = new Date()): boolean {
  if (!record.reviewed_at) return true;
  return new Date(record.next_review_due).getTime() < now.getTime();
}

export const adminListProviderDataHandlingRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("provider_data_handling_records")
      .select("*")
      .order("provider_name", { ascending: true });
    if (error) throw error;
    return { records: data ?? [] };
  });

export const adminUpsertProviderDataHandlingRecord = createServerFn({ method: "POST" })
  .validator((d: {
    providerName: string;
    zeroDataRetention?: boolean | null;
    usedForTraining?: boolean | null;
    coversCreatorData?: boolean | null;
    coversSupporterData?: boolean | null;
    contractReference?: string | null;
    notes?: string | null;
    nextReviewDue?: string;
    markReviewedNow?: boolean;
  }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = {
      provider_name: data.providerName,
      zero_data_retention: data.zeroDataRetention ?? null,
      used_for_training: data.usedForTraining ?? null,
      covers_creator_data: data.coversCreatorData ?? null,
      covers_supporter_data: data.coversSupporterData ?? null,
      contract_reference: data.contractReference?.trim() || null,
      notes: data.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (data.nextReviewDue) patch.next_review_due = data.nextReviewDue;
    if (data.markReviewedNow) {
      patch.reviewed_at = new Date().toISOString();
      patch.reviewed_by = context.userId;
    }
    const { error } = await context.supabase
      .from("provider_data_handling_records")
      .upsert(patch as any, { onConflict: "provider_name" });
    if (error) throw error;
    await logAudit(context.userId, "admin.provider_data_handling_updated", { type: "provider", id: data.providerName }, {
      reviewed: !!data.markReviewedNow,
    });
    return { ok: true };
  });

/**
 * Gate for the ChatProvider/GenerationProvider selection point. Existence of
 * a record — not reviewed_at — is what gates activation: the two providers
 * already live in production (lovable_gateway, venice) are seeded so this
 * never breaks existing chat, even though their review is still pending.
 * Overdue/unreviewed status is surfaced in the admin dashboard, not enforced
 * as a runtime block, since taking down live chat over an unfinished
 * governance review would be a worse outcome than the risk it prevents.
 * Genuinely new providers with no row at all are blocked outright — add
 * one via the admin dashboard before wiring in a new provider.
 */
export async function assertProviderDataHandlingReviewed(providerName: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("provider_data_handling_records")
    .select("id")
    .eq("provider_name", providerName)
    .maybeSingle();
  if (!data) {
    throw new Error(
      `Provider "${providerName}" has no data-handling record. Add one via the admin dashboard (Providers tab) before enabling this provider.`,
    );
  }
}
