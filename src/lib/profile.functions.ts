import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Sensitive columns aren't exposed via table-level SELECT anymore;
    // use the security-definer helper which returns the caller's own row only.
    const { data, error } = await (supabase as any).rpc("get_my_profile");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { profile: null };
    const {
      id, display_name, full_name, bio, avatar_url, country, handle,
      profile_completed_at, created_at,
    } = row;
    return {
      profile: { id, display_name, full_name, bio, avatar_url, country, handle, profile_completed_at, created_at },
    };
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
    const patch: {
      display_name?: string | null;
      full_name?: string | null;
      bio?: string | null;
      avatar_url?: string | null;
      country?: string | null;
      profile_completed_at?: string;
    } = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (data.country !== undefined) patch.country = data.country;
    if (data.markComplete) patch.profile_completed_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });