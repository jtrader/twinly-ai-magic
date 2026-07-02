import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

const DEMO_TAG = "demo-seed";

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
  .validator((d: { creatorId: string }) => d)
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

    // Determine redirect origin from request headers
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/(https?:\/\/[^/]+).*/, "$1") || "";
    const redirectTo = `${origin}/studio`;

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkErr || !link?.properties?.action_link) throw new Error(linkErr?.message ?? "Failed to mint link");

    await logAudit(context.userId, "admin.impersonate", { type: "creator", id: creator.id }, { handle: creator.handle });
    return { url: link.properties.action_link, creator: { handle: creator.handle, stage_name: creator.stage_name } };
  });