import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAudit } from "./audit.server";
import { canViewerSeeTier, isPayingSubscriber, type FeedVisibilityTier } from "./feed-visibility-access.server";

type PollType = "single_choice" | "multi_choice" | "tip_to_vote";
type PollStatus = "draft" | "active" | "closed";

async function requireCreator(supabase: any, userId: string) {
  const { data: creator, error } = await supabase
    .from("creators").select("id, handle, stage_name").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!creator) throw new Error("Create your creator profile first.");
  return creator as { id: string; handle: string; stage_name: string };
}

async function requireOwnedPoll(supabase: any, userId: string, pollId: string) {
  const creator = await requireCreator(supabase, userId);
  const { data: poll, error } = await supabase.from("polls").select("*").eq("id", pollId).eq("creator_id", creator.id).maybeSingle();
  if (error) throw error;
  if (!poll) throw new Error("Poll not found, or you don't own it.");
  return { creator, poll };
}

/**
 * Flips an already-overdue poll to closed and notifies every distinct
 * supporter who voted that results are final. Callable directly once the
 * caller already knows the poll is past its deadline (the cron route),
 * or via closeIfPastDeadline below (the lazy per-request check).
 */
export async function closePollAndNotify(supabaseAdmin: any, pollId: string): Promise<void> {
  const { data: poll } = await supabaseAdmin.from("polls").select("id, question, creator_id, status").eq("id", pollId).maybeSingle();
  if (!poll || poll.status !== "active") return;

  await supabaseAdmin.from("polls").update({ status: "closed" }).eq("id", pollId);

  const { data: responses } = await supabaseAdmin.from("poll_responses").select("supporter_id").eq("poll_id", pollId);
  const supporterIds = [...new Set((responses ?? []).map((r: any) => r.supporter_id))];
  if (supporterIds.length === 0) return;

  const { createNotification } = await import("./notifications.functions");
  for (const supporterId of supporterIds) {
    await createNotification({
      userId: supporterId as string,
      type: "poll_closed",
      title: "A poll you voted in has closed",
      body: poll.question,
      isAiGenerated: false,
    }).catch(() => {});
  }
}

/** Lazy expiry check — this app has no background job runner beyond the cron route below. */
export async function closeIfPastDeadline(supabaseAdmin: any, pollId: string): Promise<PollStatus> {
  const { data: poll } = await supabaseAdmin.from("polls").select("status, closes_at").eq("id", pollId).maybeSingle();
  if (!poll) throw new Error("Poll not found");
  if (isPollPastDeadline(poll)) {
    await closePollAndNotify(supabaseAdmin, pollId);
    return "closed";
  }
  return poll.status as PollStatus;
}

/** Pure decision, no DB access — whether an active poll's deadline has passed and it should be closed. */
export function isPollPastDeadline(poll: { status: string; closes_at: string | null }): boolean {
  return poll.status === "active" && !!poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now();
}

export const createPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    personaId?: string | null;
    question: string;
    pollType: PollType;
    visibility?: FeedVisibilityTier;
    closesAt?: string | null;
    anonymous?: boolean;
    resultsVisibleAfterClose?: boolean;
    options: Array<{ label: string; linkedTipAmountUsd?: number | null }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const creator = await requireCreator(supabase, userId);

    const question = data.question.trim();
    if (question.length < 1 || question.length > 500) throw new Error("Question must be 1–500 characters.");
    if (data.options.length < 2) throw new Error("A poll needs at least 2 options.");
    if (data.options.length > 20) throw new Error("A poll can have at most 20 options.");
    if (data.pollType === "tip_to_vote") {
      for (const o of data.options) {
        if (!o.linkedTipAmountUsd || o.linkedTipAmountUsd < 1) {
          throw new Error("Every option needs a tip amount of at least $1 for a tip-to-vote poll.");
        }
      }
    }

    const { data: poll, error } = await supabase
      .from("polls")
      .insert({
        creator_id: creator.id,
        persona_id: data.personaId ?? null,
        question,
        poll_type: data.pollType,
        visibility: data.visibility ?? "public",
        closes_at: data.closesAt ?? null,
        anonymous: data.anonymous ?? true,
        results_visible_after_close: data.resultsVisibleAfterClose ?? false,
        status: "draft" as const,
      })
      .select("*").single();
    if (error) throw error;

    const optionRows = data.options.map((o, i) => ({
      poll_id: poll.id,
      label: o.label.trim().slice(0, 200),
      display_order: i,
      linked_tip_amount_usd: data.pollType === "tip_to_vote" ? o.linkedTipAmountUsd : null,
    }));
    const { error: optErr } = await supabase.from("poll_options").insert(optionRows);
    if (optErr) throw optErr;

    await logAudit(userId, "poll.created", { type: "poll", id: poll.id }, { pollType: data.pollType });
    return { poll };
  });

/** Full edit while draft; once active, only closesAt is patchable here (use setPollStatus to close). */
export const updatePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    pollId: string;
    question?: string;
    visibility?: FeedVisibilityTier;
    closesAt?: string | null;
    anonymous?: boolean;
    resultsVisibleAfterClose?: boolean;
    options?: Array<{ label: string; linkedTipAmountUsd?: number | null }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { poll } = await requireOwnedPoll(supabase, userId, data.pollId);

    if (poll.status !== "draft") {
      // Once active/closed, rewriting the question/options/visibility mid-vote
      // is confusing and unfair to people who already voted — only closesAt
      // (and status, via setPollStatus) may still change.
      if (data.question !== undefined || data.visibility !== undefined || data.options !== undefined || data.anonymous !== undefined || data.resultsVisibleAfterClose !== undefined) {
        throw new Error("This poll is no longer a draft — only its close time can be changed now.");
      }
      if (data.closesAt !== undefined) {
        const { error } = await supabase.from("polls").update({ closes_at: data.closesAt }).eq("id", data.pollId);
        if (error) throw error;
      }
      return { ok: true };
    }

    const patch: {
      question?: string;
      visibility?: FeedVisibilityTier;
      closes_at?: string | null;
      anonymous?: boolean;
      results_visible_after_close?: boolean;
    } = {};
    if (data.question !== undefined) {
      const v = data.question.trim();
      if (v.length < 1 || v.length > 500) throw new Error("Question must be 1–500 characters.");
      patch.question = v;
    }
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if (data.closesAt !== undefined) patch.closes_at = data.closesAt;
    if (data.anonymous !== undefined) patch.anonymous = data.anonymous;
    if (data.resultsVisibleAfterClose !== undefined) patch.results_visible_after_close = data.resultsVisibleAfterClose;

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("polls").update(patch).eq("id", data.pollId);
      if (error) throw error;
    }

    if (data.options) {
      if (data.options.length < 2) throw new Error("A poll needs at least 2 options.");
      if (data.options.length > 20) throw new Error("A poll can have at most 20 options.");
      const pollType = poll.poll_type as PollType;
      if (pollType === "tip_to_vote") {
        for (const o of data.options) {
          if (!o.linkedTipAmountUsd || o.linkedTipAmountUsd < 1) throw new Error("Every option needs a tip amount of at least $1.");
        }
      }
      await supabase.from("poll_options").delete().eq("poll_id", data.pollId);
      const optionRows = data.options.map((o, i) => ({
        poll_id: data.pollId,
        label: o.label.trim().slice(0, 200),
        display_order: i,
        linked_tip_amount_usd: pollType === "tip_to_vote" ? o.linkedTipAmountUsd : null,
      }));
      const { error: optErr } = await supabase.from("poll_options").insert(optionRows);
      if (optErr) throw optErr;
    }

    return { ok: true };
  });

/** draft -> active -> closed only; no re-opening a closed poll, no un-publishing an active one. */
export const setPollStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { pollId: string; status: "active" | "closed" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { poll } = await requireOwnedPoll(supabase, userId, data.pollId);

    const validTransition = (poll.status === "draft" && data.status === "active") || (poll.status === "active" && data.status === "closed");
    if (!validTransition) throw new Error(`Can't move a ${poll.status} poll to ${data.status}.`);

    if (data.status === "closed") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await closePollAndNotify(supabaseAdmin, data.pollId);
    } else {
      const { error } = await supabase.from("polls").update({ status: data.status }).eq("id", data.pollId);
      if (error) throw error;
    }

    await logAudit(userId, "poll.status_changed", { type: "poll", id: data.pollId }, { status: data.status });
    return { ok: true };
  });

export const listCreatorPolls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const creator = await requireCreator(context.supabase, context.userId);
    const { data: polls, error } = await context.supabase
      .from("polls").select("*, poll_options(id, label, display_order, linked_tip_amount_usd)")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { polls: polls ?? [] };
  });

/** Creator-only results view — always full detail regardless of the poll's own `anonymous` display setting. */
export const getPollResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { pollId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { poll } = await requireOwnedPoll(supabase, userId, data.pollId);

    const [{ data: options }, { data: responses }] = await Promise.all([
      supabase.from("poll_options").select("id, label, display_order, linked_tip_amount_usd").eq("poll_id", data.pollId).order("display_order"),
      supabase.from("poll_responses").select("poll_option_id, supporter_id, created_at").eq("poll_id", data.pollId),
    ]);

    const supporterIds = [...new Set((responses ?? []).map((r: any) => r.supporter_id))];
    const { data: profiles } = supporterIds.length
      ? await supabase.from("profiles_public" as any).select("id, display_name").in("id", supporterIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    const totalVoters = supporterIds.length;
    const counts = (options ?? []).map((o: any) => {
      const votes = (responses ?? []).filter((r: any) => r.poll_option_id === o.id);
      return {
        optionId: o.id,
        label: o.label,
        count: votes.length,
        percentage: totalVoters > 0 ? Math.round((votes.length / (responses ?? []).length || 0) * 1000) / 10 : 0,
        voters: votes.map((v: any) => ({ supporterId: v.supporter_id, name: profileMap.get(v.supporter_id) ?? "Someone", votedAt: v.created_at })),
      };
    });

    return { poll, totalVoters, totalResponses: (responses ?? []).length, options: counts };
  });

/** Standalone (not feed-attached) active/closed polls for a creator's public profile. */
export const listCreatorPollsPublic = createServerFn({ method: "GET" })
  .validator((d: { handle: string; viewerId?: string | null }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creator } = await supabaseAdmin.from("creators").select("id").eq("handle", data.handle).maybeSingle();
    if (!creator) return { polls: [] };

    const { data: attached } = await supabaseAdmin.from("creator_posts").select("linked_poll_id").eq("creator_id", creator.id).not("linked_poll_id", "is", null);
    const attachedIds = new Set((attached ?? []).map((p: any) => p.linked_poll_id));

    const { data: polls } = await supabaseAdmin
      .from("polls")
      .select("*, poll_options(id, label, display_order, linked_tip_amount_usd)")
      .eq("creator_id", creator.id)
      .in("status", ["active", "closed"])
      .order("created_at", { ascending: false });

    const standalone = (polls ?? []).filter((p: any) => !attachedIds.has(p.id));
    const isAuthed = !!data.viewerId;
    const isPaying = data.viewerId ? await isPayingSubscriber(supabaseAdmin, data.viewerId, creator.id) : false;
    const visible = standalone.filter((p: any) => canViewerSeeTier(p.visibility, { isAuthed, isPayingSubscriber: isPaying }));

    return { polls: await hydrateWithViewerState(supabaseAdmin, visible, data.viewerId ?? null) };
  });

/** Exported for reuse by posts.functions.ts when hydrating feed-attached polls — not reimplemented per surface. */
export async function hydrateWithViewerState(supabaseAdmin: any, polls: any[], viewerId: string | null) {
  if (polls.length === 0) return [];
  const pollIds = polls.map((p) => p.id);
  const { data: myResponses } = viewerId
    ? await supabaseAdmin.from("poll_responses").select("poll_id, poll_option_id").eq("supporter_id", viewerId).in("poll_id", pollIds)
    : { data: [] as any[] };
  const myByPoll = new Map<string, string[]>();
  for (const r of myResponses ?? []) {
    const arr = myByPoll.get(r.poll_id) ?? [];
    arr.push(r.poll_option_id);
    myByPoll.set(r.poll_id, arr);
  }

  const { data: allResponses } = await supabaseAdmin.from("poll_responses").select("poll_id, poll_option_id").in("poll_id", pollIds);
  const countsByOption = new Map<string, number>();
  const totalsByPoll = new Map<string, number>();
  for (const r of allResponses ?? []) {
    countsByOption.set(r.poll_option_id, (countsByOption.get(r.poll_option_id) ?? 0) + 1);
    totalsByPoll.set(r.poll_id, (totalsByPoll.get(r.poll_id) ?? 0) + 1);
  }

  return polls.map((p) => {
    const myVotes = myByPoll.get(p.id) ?? [];
    const hasVoted = myVotes.length > 0;
    // Baseline: must vote before seeing results at all. Once voted, the
    // creator's results_visible_after_close setting decides whether that's
    // immediate or gated until the poll closes. A closed poll always shows
    // final results to anyone with visibility access, voted or not.
    const showResults = p.status === "closed" ? true : hasVoted && !p.results_visible_after_close;
    return {
      ...p,
      myVotes,
      hasVoted,
      showResults,
      totalResponses: totalsByPoll.get(p.id) ?? 0,
      options: (p.poll_options ?? [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((o: any) => ({ ...o, count: countsByOption.get(o.id) ?? 0 })),
    };
  });
}

export const submitPollVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { pollId: string; optionIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (!data.optionIds.length) throw new Error("Select at least one option.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: poll } = await supabaseAdmin.from("polls").select("*").eq("id", data.pollId).maybeSingle();
    if (!poll) throw new Error("Poll not found");
    if (poll.poll_type === "tip_to_vote") throw new Error("This poll requires a tip — vote via the tip checkout instead.");

    const status = await closeIfPastDeadline(supabaseAdmin, data.pollId);
    if (status !== "active") throw new Error("This poll isn't open for voting.");

    const isPaying = await isPayingSubscriber(supabaseAdmin, userId, poll.creator_id);
    if (!canViewerSeeTier(poll.visibility, { isAuthed: true, isPayingSubscriber: isPaying })) {
      throw new Error("You don't have access to this poll.");
    }

    const { data: options } = await supabaseAdmin.from("poll_options").select("id").eq("poll_id", data.pollId).in("id", data.optionIds);
    if ((options ?? []).length !== data.optionIds.length) throw new Error("Invalid option selected.");

    if (poll.poll_type === "single_choice" && data.optionIds.length !== 1) {
      throw new Error("Select exactly one option for this poll.");
    }

    if (poll.poll_type === "single_choice") {
      const { data: existing } = await supabaseAdmin
        .from("poll_responses").select("id").eq("poll_id", data.pollId).eq("supporter_id", userId).maybeSingle();
      if (existing) throw new Error("You've already voted in this poll.");
      const { error } = await supabaseAdmin.from("poll_responses").insert({
        poll_id: data.pollId, poll_option_id: data.optionIds[0], supporter_id: userId, poll_type: "single_choice",
      });
      if (error) {
        if ((error as any).code === "23505") throw new Error("You've already voted in this poll.");
        throw error;
      }
    } else {
      // multi_choice: replace the supporter's current selection set.
      await supabaseAdmin.from("poll_responses").delete().eq("poll_id", data.pollId).eq("supporter_id", userId);
      const rows = data.optionIds.map((optionId) => ({
        poll_id: data.pollId, poll_option_id: optionId, supporter_id: userId, poll_type: "multi_choice" as const,
      }));
      const { error } = await supabaseAdmin.from("poll_responses").insert(rows);
      if (error) throw error;
    }

    const { data: creatorRow } = await supabaseAdmin.from("creators").select("user_id").eq("id", poll.creator_id).maybeSingle();
    if (creatorRow?.user_id) {
      const { createNotification } = await import("./notifications.functions");
      await createNotification({
        userId: creatorRow.user_id,
        type: "poll_response",
        title: "New poll response",
        body: poll.question,
        linkPath: "/studio/polls",
        isAiGenerated: false,
      }).catch(() => {});
    }

    return { ok: true };
  });
