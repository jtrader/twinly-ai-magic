import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { createNotification } from "./notifications.functions";

async function requireCreator(supabase: any, userId: string) {
  const { data, error } = await supabase.from("creators").select("id, handle").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Complete your creator profile first.");
  return data as { id: string; handle: string };
}

/** Lazily expire anything past its window — this app has no background job runner. */
async function expireStale(supabase: any, creatorId?: string) {
  let q = supabase
    .from("escalation_requests")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("status", "requested")
    .lt("expires_at", new Date().toISOString());
  if (creatorId) q = q.eq("creator_id", creatorId);
  await q;
}

/** Fan-side: ask to move from an AI persona to the creator's Real Me thread. */
export const requestEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { creatorHandle: string; personaSlug: string; message?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: creator } = await supabaseAdmin
      .from("creators").select("id").eq("handle", data.creatorHandle).maybeSingle();
    if (!creator) throw new Error("Creator not found");

    const { data: fromPersona } = await supabaseAdmin
      .from("personas").select("id, kind, display_name")
      .eq("creator_id", creator.id).eq("slug", data.personaSlug).maybeSingle();
    if (!fromPersona) throw new Error("Persona not found");
    if (fromPersona.kind !== "ai") throw new Error("You're already talking to Real Me.");

    const { data: realMe } = await supabaseAdmin
      .from("personas").select("id, slug, price_cents")
      .eq("creator_id", creator.id).eq("kind", "real_me").maybeSingle();
    if (!realMe) throw new Error("This creator hasn't set up Real Me access yet.");

    await expireStale(supabase, creator.id);

    const { data: existing } = await supabase
      .from("escalation_requests")
      .select("id, status")
      .eq("supporter_id", userId).eq("creator_id", creator.id).eq("from_persona_id", fromPersona.id)
      .eq("status", "requested")
      .maybeSingle();
    if (existing) return { request: existing, alreadyPending: true };

    const { data: request, error } = await supabase
      .from("escalation_requests")
      .insert({
        supporter_id: userId,
        creator_id: creator.id,
        from_persona_id: fromPersona.id,
        price_cents: Math.max(0, realMe.price_cents ?? 0),
        message: data.message?.trim().slice(0, 500) || null,
      })
      .select("*").single();
    if (error) throw error;

    await logAudit(userId, "escalation.requested", { type: "escalation_request", id: request.id }, { creatorId: creator.id });

    const { data: creatorRow } = await supabaseAdmin.from("creators").select("user_id").eq("id", creator.id).maybeSingle();
    if (creatorRow?.user_id) {
      await createNotification({
        userId: creatorRow.user_id,
        type: "escalation_requested",
        title: `Real Me request from a supporter`,
        body: `Via ${fromPersona.display_name}${data.message ? `: "${data.message.slice(0, 100)}"` : ""}`,
        linkPath: "/studio/escalations",
        personaId: fromPersona.id,
        isAiGenerated: false,
      }).catch(() => {});
    }

    return { request, alreadyPending: false };
  });

export const listMyEscalationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("escalation_requests")
      .select("id, status, price_cents, message, requested_at, resolved_at, expires_at, creators:creator_id(handle, stage_name), personas:from_persona_id(display_name, slug)")
      .eq("supporter_id", context.userId)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    return { requests: data ?? [] };
  });

export const listCreatorEscalationRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);
    await expireStale(supabase, creator.id);

    const { data, error } = await supabase
      .from("escalation_requests")
      .select("id, status, price_cents, message, requested_at, resolved_at, expires_at, supporter_id, personas:from_persona_id(display_name, slug)")
      .eq("creator_id", creator.id)
      .order("requested_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const supporterIds = [...new Set((data ?? []).map((r: any) => r.supporter_id))];
    let profiles: any[] = [];
    if (supporterIds.length) {
      const { data: p } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", supporterIds);
      profiles = p ?? [];
    }
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return {
      requests: (data ?? []).map((r: any) => ({ ...r, supporter: profileMap.get(r.supporter_id) ?? null })),
    };
  });

/** Creator-side accept/decline. On accept, ensures (does not relabel) a separate Real Me conversation thread. */
export const respondToEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; action: "accept" | "decline" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const { data: req, error: reqErr } = await supabase
      .from("escalation_requests")
      .select("id, status, supporter_id, creator_id")
      .eq("id", data.id).eq("creator_id", creator.id)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!req) throw new Error("Request not found");
    if (req.status !== "requested") throw new Error("This request has already been resolved.");

    const status = data.action === "accept" ? "accepted" : "declined";
    const { error } = await supabase
      .from("escalation_requests")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;

    let realMeSlug: string | null = null;
    if (data.action === "accept") {
      const { data: realMe } = await supabase
        .from("personas").select("id, slug").eq("creator_id", creator.id).eq("kind", "real_me").maybeSingle();
      if (realMe) {
        realMeSlug = realMe.slug;
        // Get-or-create the Real Me conversation — a genuinely separate
        // thread from the AI persona conversation, never a relabeling of it.
        const { data: existingConvo } = await supabase
          .from("conversations").select("id")
          .eq("fan_id", req.supporter_id).eq("persona_id", realMe.id)
          .maybeSingle();
        if (!existingConvo) {
          await supabase.from("conversations").insert({
            fan_id: req.supporter_id, creator_id: creator.id, persona_id: realMe.id,
          });
        }
      }
    }

    await logAudit(userId, `escalation.${data.action}ed`, { type: "escalation_request", id: data.id }, {});

    await createNotification({
      userId: req.supporter_id,
      type: data.action === "accept" ? "escalation_accepted" : "escalation_declined",
      title: data.action === "accept" ? "Your Real Me request was accepted" : "Your Real Me request was declined",
      body: data.action === "accept" ? "You can now chat directly with the creator." : undefined,
      linkPath: realMeSlug ? `/chat/${creator.handle}/${realMeSlug}` : undefined,
      isAiGenerated: false,
    }).catch(() => {});

    return { ok: true, realMeSlug };
  });
