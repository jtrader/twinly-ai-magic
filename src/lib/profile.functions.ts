import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, full_name, bio, avatar_url, country, handle, profile_completed_at, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: data };
  });

const UpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(60).optional(),
  full_name: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  avatar_url: z.string().trim().max(500).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  markComplete: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    for (const k of ["display_name", "full_name", "bio", "avatar_url", "country"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.markComplete) patch.profile_completed_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });