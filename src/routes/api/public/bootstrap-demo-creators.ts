import { createFileRoute } from "@tanstack/react-router";

/**
 * Idempotent one-shot bootstrap. Seeds the three canonical demo creators
 * (Aurora, Kai, Luna) with personas, approved packs, and sample assets so
 * the public site has content to display. Runs only when zero creators
 * currently exist — subsequent calls are a no-op.
 */
export const Route = createFileRoute("/api/public/bootstrap-demo-creators")({
  server: {
    handlers: {
      GET: async () => run(),
      POST: async () => run(),
    },
  },
});

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

type PersonaSpec = {
  slug: string;
  display_name: string;
  description: string;
  system_prompt: string;
  kind: "real_me" | "ai";
  disclosure_label: string;
  is_explicit?: boolean;
};

type DemoSpec = {
  handle: string;
  stage_name: string;
  bio: string;
  avatar: string;
  cover: string;
  personas: PersonaSpec[];
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

async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Guard: only seed if the creators table is empty.
  const { count } = await supabaseAdmin
    .from("creators")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return json(200, { ok: true, skipped: true, reason: "creators already exist", count });
  }

  const results: Array<{ handle: string; status: string; error?: string }> = [];

  for (const spec of DEMO_CREATORS) {
    try {
      const email = `demo+${spec.handle}@twinly.life`;

      // Find or create the auth user.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      let userId = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (!userId) {
        const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: crypto.randomUUID() + "Aa1!",
          email_confirm: true,
          user_metadata: { display_name: spec.stage_name, demo: true },
        });
        if (cErr || !created?.user) throw new Error(cErr?.message ?? "createUser failed");
        userId = created.user.id;
      }

      await supabaseAdmin.from("profiles").upsert({
        id: userId!,
        display_name: spec.stage_name,
        avatar_url: spec.avatar,
        age_verified_at: new Date().toISOString(),
        explicit_content_opt_in: true,
      }, { onConflict: "id" });

      const { data: c, error: cErr2 } = await supabaseAdmin
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
      if (cErr2 || !c) throw cErr2 ?? new Error("insert creator failed");
      const creatorId = c.id;

      // Personas
      let order = 0;
      for (const p of spec.personas) {
        const { data: existingP } = await supabaseAdmin
          .from("personas").select("id").eq("creator_id", creatorId).eq("slug", p.slug).maybeSingle();
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
          await supabaseAdmin.from("personas").insert({ ...patch, creator_id: creatorId, slug: p.slug });
        }
        order += 1;
      }

      // Approve any default packs seeded by the trigger.
      await supabaseAdmin.from("content_packs").update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        tags: [DEMO_TAG],
      }).eq("creator_id", creatorId);

      // Sample assets — mix of approved / pending / rejected, some AI.
      const urls = SAMPLE_IMAGES[spec.handle] ?? SAMPLE_IMAGES.aurora;
      const rows = urls.map((url, i) => {
        const isSynthetic = i >= 4;
        const status = i < 4 ? "approved" : i === 4 ? "pending" : "rejected";
        return {
          creator_id: creatorId,
          asset_type: "image" as const,
          external_url: url,
          title: `${spec.stage_name} — Sample ${i + 1}${isSynthetic ? " (AI)" : ""}`,
          is_synthetic: isSynthetic,
          ai_generated_label: isSynthetic,
          ai_disclosure_required: isSynthetic,
          source_type: (isSynthetic ? "ai_generated" : "real_upload") as any,
          visibility: "public" as any,
          approval_status: status as any,
          consent_status: "on_file" as any,
          moderation_status: "clean" as any,
          internal_label: (isSynthetic ? "approved_synthetic" : "real_upload") as any,
          price_cents: 0,
          tags: [DEMO_TAG],
        };
      });
      const { data: inserted } = await supabaseAdmin
        .from("content_assets")
        .insert(rows)
        .select("id, approval_status");

      // Attach approved assets to the Nice pack.
      const { data: nicePack } = await supabaseAdmin
        .from("content_packs")
        .select("id")
        .eq("creator_id", creatorId)
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

      results.push({ handle: spec.handle, status: "created" });
    } catch (e: any) {
      results.push({ handle: spec.handle, status: "error", error: e?.message ?? String(e) });
    }
  }

  return json(200, { ok: true, results });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}