import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

const DEMO_TAG = "demo-seed";

const SAMPLE_IMAGES: Record<string, string[]> = {
  aurora: [
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200",
    "https://images.unsplash.com/photo-1520975916090-3105956dac38?w=1200",
    "https://images.unsplash.com/photo-1520975922284-9d3ffb2c1c69?w=1200",
    "https://images.unsplash.com/photo-1519638399535-1b036603ac77?w=1200",
    "https://images.unsplash.com/photo-1499415479124-43c32433a620?w=1200",
    "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=1200",
  ],
  kaiwolf: [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200",
    "https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1200",
    "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200",
    "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1200",
    "https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=1200",
  ],
  lunamarie: [
    "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1200",
    "https://images.unsplash.com/photo-1508921912186-1d1a45ebb3c1?w=1200",
    "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200",
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1200",
    "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200",
    "https://images.unsplash.com/photo-1444927714506-8492d94b5ba0?w=1200",
  ],
};

type DemoSpec = {
  handle: string;
  stage_name: string;
  bio: string;
  avatar: string;
  cover: string;
  personas: Array<{ slug: string; display_name: string; description: string; system_prompt: string; kind: "real_me" | "ai"; disclosure_label: string; is_explicit?: boolean }>;
};

const DEMO_CREATORS: DemoSpec[] = [
  {
    handle: "aurora",
    stage_name: "Aurora Vale",
    bio: "Neon-lit dreamscapes, cyberpunk portraits, and after-hours conversation.",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
    cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&h=400&fit=crop",
    personas: [
      { slug: "real-me", display_name: "Real Aurora", kind: "real_me", disclosure_label: "Real Me — Human creator", description: "The real Aurora, replying personally when online.", system_prompt: "You are Aurora Vale, replying in your own voice. Warm, curious, slightly poetic." },
      { slug: "nice-ai", display_name: "Aurora (Nice)", kind: "ai", disclosure_label: "Nice AI — Official AI persona", description: "Soft, dreamy, PG-rated companion side of Aurora.", system_prompt: "You are the Nice AI persona of Aurora Vale. Soft, poetic, PG. Always disclose you are an AI if asked." },
      { slug: "naughty-ai", display_name: "Aurora (Naughty)", kind: "ai", disclosure_label: "Naughty AI — Official AI persona", description: "Playful, flirtier AI side of Aurora.", system_prompt: "You are the Naughty AI persona of Aurora Vale. Flirty and playful but never explicit unless the creator has enabled it. Disclose you are an AI if asked.", is_explicit: false },
    ],
  },
  {
    handle: "kaiwolf",
    stage_name: "Kai Wolf",
    bio: "Bay Area photographer. Motorcycles, mountains, and honest replies.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces",
    cover: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&h=400&fit=crop",
    personas: [
      { slug: "real-me", display_name: "Real Kai", kind: "real_me", disclosure_label: "Real Me — Human creator", description: "Kai answering personally between rides and shoots.", system_prompt: "You are Kai Wolf, a laid-back photographer. Direct, dry humour, occasional gear talk." },
      { slug: "nice-ai", display_name: "Kai (Guide)", kind: "ai", disclosure_label: "Nice AI — Official AI persona", description: "AI travel + photography guide trained on Kai's style.", system_prompt: "You are the AI guide persona of Kai Wolf. Helpful travel + photography tips in Kai's voice. Disclose you are an AI if asked." },
    ],
  },
  {
    handle: "lunamarie",
    stage_name: "Luna Marie",
    bio: "Cottagecore vibes, poetry, and slow Sundays.",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop&crop=faces",
    cover: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1200&h=400&fit=crop",
    personas: [
      { slug: "real-me", display_name: "Real Luna", kind: "real_me", disclosure_label: "Real Me — Human creator", description: "Luna, replying between garden days and open mics.", system_prompt: "You are Luna Marie. Gentle, thoughtful, uses small nature metaphors." },
      { slug: "nice-ai", display_name: "Luna (Nice)", kind: "ai", disclosure_label: "Nice AI — Official AI persona", description: "Cosy, comforting AI persona.", system_prompt: "You are the Nice AI persona of Luna Marie. Warm, cottagecore, PG. Disclose you are an AI if asked." },
      { slug: "wicked-ai", display_name: "Luna (Wicked)", kind: "ai", disclosure_label: "Wicked AI — Official AI persona", description: "Premium fantasy AI persona (adults only).", system_prompt: "You are the Wicked AI persona of Luna Marie. Fantasy roleplay for verified adults only. Refuse anything involving minors or non-consent.", is_explicit: true },
    ],
  },
];

export const adminListDemoCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const handles = DEMO_CREATORS.map((c) => c.handle);
    const { data: creators } = await supabaseAdmin
      .from("creators")
      .select("id, handle, stage_name, avatar_url, bio, user_id, verification_status")
      .in("handle", handles);
    const emails: Record<string, string | null> = {};
    for (const c of creators ?? []) {
      if (!c.user_id) continue;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.user_id);
      emails[c.id] = u?.user?.email ?? null;
    }
    return {
      seeded: creators ?? [],
      available: DEMO_CREATORS.map((d) => ({ handle: d.handle, stage_name: d.stage_name, bio: d.bio, avatar: d.avatar })),
      emails,
    };
  });

export const adminSeedDemoCreators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");

    const results: Array<{ handle: string; status: "created" | "existed" | "error"; email?: string; error?: string }> = [];

    for (const spec of DEMO_CREATORS) {
      try {
        // Check by handle first
        const { data: existing } = await supabaseAdmin
          .from("creators")
          .select("id, user_id")
          .eq("handle", spec.handle)
          .maybeSingle();

        let userId = existing?.user_id ?? null;
        const email = `demo+${spec.handle}@twinly.life`;

        if (!userId) {
          // Try to find existing auth user by email
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
          if (found) {
            userId = found.id;
          } else {
            const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: crypto.randomUUID() + "Aa1!", // random; only magic-link login
              email_confirm: true,
              user_metadata: { display_name: spec.stage_name, demo: true },
            });
            if (createErr || !created?.user) throw new Error(createErr?.message ?? "createUser failed");
            userId = created.user.id;
          }
        }

        // Ensure profile exists (trigger normally handles this; safe upsert)
        await supabaseAdmin.from("profiles").upsert({
          id: userId!,
          display_name: spec.stage_name,
          avatar_url: spec.avatar,
          age_verified_at: new Date().toISOString(),
          explicit_content_opt_in: true,
        }, { onConflict: "id" });

        // Upsert creator (this triggers seed_default_personas + seed_default_packs on insert)
        let creatorId = existing?.id ?? null;
        if (!creatorId) {
          const { data: c, error: cErr } = await supabaseAdmin
            .from("creators")
            .insert({
              user_id: userId!,
              handle: spec.handle,
              stage_name: spec.stage_name,
              bio: spec.bio,
              avatar_url: spec.avatar,
              cover_url: spec.cover,
              verification_status: "verified",
              onboarding_completed_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          creatorId = c.id;
        } else {
          await supabaseAdmin.from("creators").update({
            stage_name: spec.stage_name, bio: spec.bio, avatar_url: spec.avatar, cover_url: spec.cover,
            verification_status: "verified",
          }).eq("id", creatorId);
        }

        // Update / insert personas
        let order = 0;
        for (const p of spec.personas) {
          const { data: existingP } = await supabaseAdmin
            .from("personas").select("id").eq("creator_id", creatorId!).eq("slug", p.slug).maybeSingle();
          const patch = {
            display_name: p.display_name,
            description: p.description,
            system_prompt: p.system_prompt,
            kind: p.kind,
            disclosure_label: p.disclosure_label,
            visibility: "public" as const,
            is_explicit: !!p.is_explicit,
            sort_order: order,
          };
          if (existingP) {
            await supabaseAdmin.from("personas").update(patch).eq("id", existingP.id);
          } else {
            await supabaseAdmin.from("personas").insert({ ...patch, creator_id: creatorId!, slug: p.slug });
          }
          order += 1;
        }

        // Approve default packs and tag them
        await supabaseAdmin.from("content_packs").update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          tags: [DEMO_TAG],
        }).eq("creator_id", creatorId!);

        // Seed sample assets + link into the first (Nice) pack
        const { data: existingSampleAssets } = await supabaseAdmin
          .from("content_assets")
          .select("id")
          .eq("creator_id", creatorId!)
          .contains("tags", [DEMO_TAG]);

        if (!existingSampleAssets || existingSampleAssets.length === 0) {
          const urls = SAMPLE_IMAGES[spec.handle] ?? SAMPLE_IMAGES.aurora;
          const rows = urls.map((url, i) => {
            const isSynthetic = i >= 4; // last 2 = synthetic samples
            const status =
              i < 4 ? "approved" : i === 4 ? "pending" : "rejected";
            return {
              creator_id: creatorId!,
              asset_type: "image" as const,
              external_url: url,
              title: `${spec.stage_name} — Sample ${i + 1}${isSynthetic ? " (AI)" : ""}`,
              is_synthetic: isSynthetic,
              ai_generated_label: isSynthetic,
              ai_disclosure_required: isSynthetic,
              source_type: (isSynthetic ? "synthetic" : "real") as any,
              visibility: "public" as any,
              approval_status: status as any,
              consent_status: "granted" as any,
              moderation_status: "clear" as any,
              price_cents: 0,
              tags: [DEMO_TAG],
            };
          });
          const { data: inserted } = await supabaseAdmin
            .from("content_assets")
            .insert(rows)
            .select("id, approval_status");

          // Attach approved assets to the "Nice" pack
          const { data: nicePack } = await supabaseAdmin
            .from("content_packs")
            .select("id")
            .eq("creator_id", creatorId!)
            .eq("pack_type", "nice")
            .maybeSingle();
          if (nicePack && inserted) {
            const items = inserted
              .filter((a) => a.approval_status === "approved")
              .map((a, idx) => ({ pack_id: nicePack.id, asset_id: a.id, position: idx }));
            if (items.length) {
              await supabaseAdmin.from("content_pack_items").insert(items);
            }
          }

          // One pending generation request for the review queue demo
          await supabaseAdmin.from("generation_requests").insert({
            creator_id: creatorId!,
            output_type: "image" as any,
            prompt_notes: `Demo request for ${spec.stage_name}: dreamy portrait, soft light.`,
            quantity: 2,
            status: "queued" as any,
            submitted_at: new Date().toISOString(),
          });
        }

        results.push({ handle: spec.handle, status: existing ? "existed" : "created", email });
      } catch (e: any) {
        results.push({ handle: spec.handle, status: "error", error: e?.message ?? String(e) });
      }
    }

    await logAudit(context.userId, "admin.demo.seed", { type: "system" }, { results });
    return { results };
  });

export const adminImpersonateCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; redirectPath?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");

    const { data: creator, error: cErr } = await supabaseAdmin
      .from("creators").select("id, handle, stage_name, user_id").eq("id", data.creatorId).maybeSingle();
    if (cErr || !creator?.user_id) throw new Error("Creator not found");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(creator.user_id);
    const email = userRes?.user?.email;
    if (!email) throw new Error("Target user has no email");

    // Look up admin's own email for the return link
    const { data: adminUserRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const adminEmail = adminUserRes?.user?.email;

    // Determine redirect origin from request headers
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/(https?:\/\/[^/]+).*/, "$1") || "";
    const path = (data.redirectPath && data.redirectPath.startsWith("/")) ? data.redirectPath : "/studio";
    const redirectTo = `${origin}${path}`;

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Failed to mint link");

    // Mint a return-to-admin magic link so the operator can bounce back after impersonating
    let returnUrl: string | null = null;
    if (adminEmail) {
      const { data: retLink } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: adminEmail,
        options: { redirectTo: `${origin}/admin` },
      });
      returnUrl = retLink?.properties?.action_link ?? null;
    }

    await logAudit(context.userId, "admin.impersonate", { type: "creator", id: creator.id }, { handle: creator.handle });
    return {
      url: link.properties.action_link,
      returnUrl,
      adminEmail: adminEmail ?? null,
      creator: { handle: creator.handle, stage_name: creator.stage_name },
    };
  });

// List every creator on the platform (admin-only) for impersonation UI.
export const adminListAllCreators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creators, error } = await supabaseAdmin
      .from("creators")
      .select("id, handle, stage_name, avatar_url, verification_status, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const emails: Record<string, string | null> = {};
    for (const c of creators ?? []) {
      if (!c.user_id) continue;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(c.user_id);
      emails[c.id] = u?.user?.email ?? null;
    }
    return { creators: creators ?? [], emails };
  });

// List every agency + owner (admin-only) for impersonation UI.
export const adminListAllAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: agencies, error } = await supabaseAdmin
      .from("agencies")
      .select("id, name, owner_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ownerIds = Array.from(new Set((agencies ?? []).map((a: any) => a.owner_user_id).filter(Boolean)));
    const emails: Record<string, string | null> = {};
    for (const uid of ownerIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
      emails[uid] = u?.user?.email ?? null;
    }
    // Count linked creators per agency
    const agencyIds = (agencies ?? []).map((a: any) => a.id);
    const { data: links } = agencyIds.length
      ? await supabaseAdmin.from("agency_creators").select("agency_id").in("agency_id", agencyIds)
      : { data: [] as any[] };
    const counts = new Map<string, number>();
    for (const l of links ?? []) counts.set(l.agency_id, (counts.get(l.agency_id) ?? 0) + 1);
    return {
      agencies: (agencies ?? []).map((a: any) => ({
        ...a,
        owner_email: a.owner_user_id ? emails[a.owner_user_id] ?? null : null,
        creator_count: counts.get(a.id) ?? 0,
      })),
    };
  });

// Impersonate any user by user_id (used for agency owners); admin-only.
export const adminImpersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string; redirectPath?: string; label?: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = userRes?.user?.email;
    if (!email) throw new Error("Target user has no email");

    const { data: adminUserRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const adminEmail = adminUserRes?.user?.email;

    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/(https?:\/\/[^/]+).*/, "$1") || "";
    const path = (data.redirectPath && data.redirectPath.startsWith("/")) ? data.redirectPath : "/app";
    const redirectTo = `${origin}${path}`;

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Failed to mint link");

    let returnUrl: string | null = null;
    if (adminEmail) {
      const { data: retLink } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink", email: adminEmail, options: { redirectTo: `${origin}/admin` },
      });
      returnUrl = retLink?.properties?.action_link ?? null;
    }

    await logAudit(context.userId, "admin.impersonate_user", { type: "user", id: data.userId }, { label: data.label ?? null });
    return { url: link.properties.action_link, returnUrl, adminEmail: adminEmail ?? null };
  });

// Impersonate a creator user account when the caller can manage that creator
// (admin OR agency owner OR the creator themselves via can_manage_creator RPC).
// Used by the agency dashboard's "Enter Studio" action.
export const impersonateManagedCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorId: string; redirectPath?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: canManage, error: rpcErr } = await context.supabase
      .rpc("can_manage_creator", { _creator_id: data.creatorId });
    if (rpcErr) throw rpcErr;
    if (!canManage) throw new Error("You don't have access to this creator.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");

    const { data: creator, error: cErr } = await supabaseAdmin
      .from("creators").select("id, handle, stage_name, user_id").eq("id", data.creatorId).maybeSingle();
    if (cErr || !creator?.user_id) throw new Error("Creator not found");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(creator.user_id);
    const email = userRes?.user?.email;
    if (!email) throw new Error("Target user has no email");

    const { data: callerRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const callerEmail = callerRes?.user?.email;

    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req.headers.get("origin")
      || req.headers.get("referer")?.replace(/(https?:\/\/[^/]+).*/, "$1")
      || "";
    const path = (data.redirectPath && data.redirectPath.startsWith("/")) ? data.redirectPath : "/studio";
    const redirectTo = `${origin}${path}`;

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Failed to mint link");

    let returnUrl: string | null = null;
    if (callerEmail) {
      const { data: retLink } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink", email: callerEmail, options: { redirectTo: `${origin}/agency` },
      });
      returnUrl = retLink?.properties?.action_link ?? null;
    }

    await logAudit(context.userId, "agency.impersonate_creator", { type: "creator", id: creator.id }, { handle: creator.handle });
    return {
      url: link.properties.action_link,
      returnUrl,
      callerEmail: callerEmail ?? null,
      creator: { handle: creator.handle, stage_name: creator.stage_name },
    };
  });

// List every "pure supporter" (fan role, no creator record, no owned agency)
// on the platform for the admin console's Supporters tab. Mirrors the shape
// of adminListAllCreators / adminListAllAgencies so the UI can render + page
// them identically.
export const adminListAllSupporters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Exclude anyone who is a creator or owns an agency — the admin already
    // has separate tabs for those two audiences.
    const [{ data: creatorLinks }, { data: agencyLinks }, { data: fanRoles }] = await Promise.all([
      supabaseAdmin.from("creators").select("user_id"),
      supabaseAdmin.from("agencies").select("owner_user_id"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "fan").limit(2000),
    ]);
    const exclude = new Set<string>();
    for (const c of creatorLinks ?? []) if ((c as any).user_id) exclude.add((c as any).user_id);
    for (const a of agencyLinks ?? []) if ((a as any).owner_user_id) exclude.add((a as any).owner_user_id);

    const fanIds = Array.from(new Set(((fanRoles ?? []) as any[]).map((r) => r.user_id).filter((id: string) => id && !exclude.has(id))));
    if (fanIds.length === 0) return { supporters: [], emails: {} as Record<string, string | null> };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, handle, avatar_url, created_at, age_verified_at, strike_count")
      .in("id", fanIds.slice(0, 500))
      .order("created_at", { ascending: false });

    const emails: Record<string, string | null> = {};
    for (const p of profiles ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById((p as any).id);
      emails[(p as any).id] = u?.user?.email ?? null;
    }
    return { supporters: profiles ?? [], emails };
  });