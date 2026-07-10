import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAgencyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const agencyQuery = supabaseAdmin
      .from("agencies")
      .select("id, name, created_at, owner_user_id");
    const { data: agencies, error: agErr } = isAdmin
      ? await agencyQuery
      : await agencyQuery.eq("owner_user_id", userId);
    if (agErr) throw agErr;
    if (!agencies || agencies.length === 0) return { agencies: [], creators: [], isAdmin: !!isAdmin };

    const agencyIds = agencies.map((a) => a.id);
    const { data: links, error: linkErr } = await supabaseAdmin
      .from("agency_creators")
      .select("agency_id, creator_id, creators!inner(id, handle, stage_name, verification_status, digital_twin_status, avatar_url)")
      .in("agency_id", agencyIds);
    if (linkErr) throw linkErr;
    return { agencies, creators: links ?? [], isAdmin: !!isAdmin };
  });