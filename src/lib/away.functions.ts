import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";

export type AwaySettings = {
  away_mode: boolean;
  away_message: string;
  away_auto_reply_enabled: boolean;
  away_allow_ai_personas: boolean;
  away_started_at: string | null;
};

export const getAwaySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("creators")
      .select("away_mode, away_message, away_auto_reply_enabled, away_allow_ai_personas, away_started_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as AwaySettings | null;
  });

export const updateAwaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Partial<AwaySettings>) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      away_mode?: boolean;
      away_started_at?: string | null;
      away_message?: string;
      away_auto_reply_enabled?: boolean;
      away_allow_ai_personas?: boolean;
    } = {};
    if (typeof data.away_mode === "boolean") {
      patch.away_mode = data.away_mode;
      patch.away_started_at = data.away_mode ? new Date().toISOString() : null;
    }
    if (typeof data.away_message === "string") {
      const msg = data.away_message.trim();
      if (msg.length < 4) throw new Error("Away message is too short.");
      if (msg.length > 500) throw new Error("Away message must be under 500 characters.");
      patch.away_message = msg;
    }
    if (typeof data.away_auto_reply_enabled === "boolean") patch.away_auto_reply_enabled = data.away_auto_reply_enabled;
    if (typeof data.away_allow_ai_personas === "boolean") patch.away_allow_ai_personas = data.away_allow_ai_personas;

    const { data: updated, error } = await supabase
      .from("creators")
      .update(patch)
      .eq("user_id", userId)
      .select("id, away_mode, away_message, away_auto_reply_enabled, away_allow_ai_personas, away_started_at")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error("Creator profile not found.");

    await logAudit(userId, "creator.away_settings_updated", { type: "creator", id: updated.id }, patch);
    return updated as AwaySettings & { id: string };
  });

/** Public: fetch availability for a creator by handle (used by chat + persona pages). */
export const getCreatorAvailability = createServerFn({ method: "GET" })
  .validator((d: { handle: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("creators")
      .select("away_mode, away_message, away_auto_reply_enabled, away_allow_ai_personas, away_started_at")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!c) return null;
    return {
      away_mode: !!c.away_mode,
      away_message: c.away_message ?? "",
      away_auto_reply_enabled: !!c.away_auto_reply_enabled,
      away_allow_ai_personas: !!c.away_allow_ai_personas,
      away_started_at: c.away_started_at ?? null,
    } as AwaySettings;
  });