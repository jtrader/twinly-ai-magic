import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export type VeniceConnectionResult =
  | { ok: true; envOk: true; missing: string[]; error: null; latencyMs: number }
  | { ok: false; envOk: boolean; missing: string[]; error: string | null };

/**
 * Admin-only connectivity check. Confirms env presence (free) then makes ONE
 * minimal real chat-completion call to prove auth + connectivity end-to-end.
 * Deliberately does NOT exercise image/video generation — those cost real
 * money and take real time; a successful chat check confirms the shared
 * VENICE_API_KEY is valid, which is what actually fails silently today.
 */
export const adminTestVeniceConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VeniceConnectionResult> => {
    await requireAdmin(context);

    const hasKey = !!process.env.VENICE_API_KEY;
    const hasModel = !!process.env.VENICE_CHAT_MODEL;
    if (!hasKey || !hasModel) {
      return {
        ok: false,
        envOk: false,
        missing: [!hasKey && "VENICE_API_KEY", !hasModel && "VENICE_CHAT_MODEL"].filter(Boolean) as string[],
        error: null,
      };
    }

    try {
      const { generateVeniceChatReply } = await import("./venice.server");
      const start = Date.now();
      await generateVeniceChatReply({
        systemPrompt: "Reply with exactly one word.",
        userMessage: "ping",
      });
      return { ok: true, envOk: true, missing: [], error: null, latencyMs: Date.now() - start };
    } catch (e: any) {
      return { ok: false, envOk: true, missing: [], error: e?.message ?? "Unknown Venice error" };
    }
  });
