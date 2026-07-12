import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPollPastDeadline } from "../polls.functions";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260711230328_polls.sql"), "utf8");
const pollsSrc = readFileSync(resolve(process.cwd(), "src/lib/polls.functions.ts"), "utf8");
const checkoutSrc = readFileSync(resolve(process.cwd(), "src/lib/checkout.functions.ts"), "utf8");

describe("isPollPastDeadline (pure)", () => {
  it("is false for a draft poll even with a past closes_at", () => {
    expect(isPollPastDeadline({ status: "draft", closes_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });

  it("is false for an active poll with no closes_at (never auto-closes)", () => {
    expect(isPollPastDeadline({ status: "active", closes_at: null })).toBe(false);
  });

  it("is false for an active poll whose deadline hasn't arrived yet", () => {
    expect(isPollPastDeadline({ status: "active", closes_at: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
  });

  it("is true for an active poll past its deadline", () => {
    expect(isPollPastDeadline({ status: "active", closes_at: new Date(Date.now() - 1000).toISOString() })).toBe(true);
  });

  it("is false for an already-closed poll (nothing left to do)", () => {
    expect(isPollPastDeadline({ status: "closed", closes_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });
});

describe("no votes accepted after close (structural)", () => {
  it("submitPollVote checks closeIfPastDeadline and rejects anything but an active poll", () => {
    const start = pollsSrc.indexOf("export const submitPollVote");
    expect(start).toBeGreaterThan(-1);
    const body = pollsSrc.slice(start);
    expect(body).toContain("closeIfPastDeadline(supabaseAdmin, data.pollId)");
    expect(body).toContain('status !== "active"');
  });

  it("createPollVoteTipCheckout (tip-to-vote) also checks closeIfPastDeadline before starting a checkout", () => {
    const start = checkoutSrc.indexOf("export const createPollVoteTipCheckout");
    expect(start).toBeGreaterThan(-1);
    const nextExport = checkoutSrc.indexOf("\nexport const", start + 1);
    const body = checkoutSrc.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(body).toContain("closeIfPastDeadline(admin, data.pollId)");
    expect(body).toContain('status !== "active"');
  });
});

describe("single-choice uniqueness enforcement (structural)", () => {
  it("the migration creates a unique index on (poll_id, supporter_id) scoped to single_choice only", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX idx_poll_responses_single_choice_unique\s+ON public\.poll_responses\(poll_id, supporter_id\) WHERE poll_type = 'single_choice'/,
    );
  });

  it("poll_responses has no unconditional unique(poll_id, supporter_id) — that would also block multi_choice", () => {
    // Only the partial index above may combine these two columns uniquely.
    const blanket = /CREATE UNIQUE INDEX[^;]*ON public\.poll_responses\(poll_id, ?supporter_id\)(?!\s*WHERE)/;
    expect(migration).not.toMatch(blanket);
  });

  it("submitPollVote pre-checks for an existing response before inserting a second single_choice vote", () => {
    const start = pollsSrc.indexOf("export const submitPollVote");
    const body = pollsSrc.slice(start);
    expect(body).toContain('poll.poll_type === "single_choice"');
    expect(body).toContain("You've already voted in this poll.");
    // Backstop against the DB constraint too, in case of a race.
    expect(body).toContain('(error as any).code === "23505"');
  });

  it("multi_choice replaces the supporter's full selection set rather than appending duplicate rows", () => {
    const start = pollsSrc.indexOf("export const submitPollVote");
    const body = pollsSrc.slice(start);
    expect(body).toMatch(/delete\(\).*eq\("poll_id", data\.pollId\).*eq\("supporter_id", userId\)/s);
  });
});

describe("tip-to-vote requires a valid tip amount (structural)", () => {
  it("the migration requires linked_tip_amount_usd to be at least $1 when set", () => {
    expect(migration).toContain("CONSTRAINT poll_options_tip_amount_positive CHECK (linked_tip_amount_usd IS NULL OR linked_tip_amount_usd >= 1)");
  });

  it("createPoll rejects a tip_to_vote poll with any option missing a valid tip amount", () => {
    const start = pollsSrc.indexOf("export const createPoll");
    const nextExport = pollsSrc.indexOf("\nexport const", start + 1);
    const body = pollsSrc.slice(start, nextExport);
    expect(body).toContain('data.pollType === "tip_to_vote"');
    expect(body).toMatch(/linkedTipAmountUsd\s*<\s*1/);
  });

  it("the tip-to-vote checkout locks the charge to the option's own price, never a client-supplied amount", () => {
    const start = checkoutSrc.indexOf("export const createPollVoteTipCheckout");
    const body = checkoutSrc.slice(start);
    // The validator only accepts pollId/optionId/returnUrl/environment — no amountCents field at all.
    const validatorMatch = body.match(/\.validator\(\(d: \{([^}]*)\}\)/);
    expect(validatorMatch).not.toBeNull();
    expect(validatorMatch![1]).not.toMatch(/amount/i);
    expect(body).toContain("option.linked_tip_amount_usd");
  });
});

describe("visibility gating reuses the existing feed-visibility service, not reimplemented (structural)", () => {
  it("polls.functions.ts imports canViewerSeeTier/isPayingSubscriber instead of its own tier logic", () => {
    expect(pollsSrc).toContain('from "./feed-visibility-access.server"');
    expect(pollsSrc).toContain("canViewerSeeTier(");
    expect(pollsSrc).toContain("isPayingSubscriber(");
    // No parallel tier-ranking table reinvented in this file.
    expect(pollsSrc).not.toMatch(/TIER_RANK\s*[:=]/);
  });

  it("the tip-to-vote checkout also reuses the shared visibility check rather than duplicating it", () => {
    const start = checkoutSrc.indexOf("export const createPollVoteTipCheckout");
    const nextExport = checkoutSrc.indexOf("\nexport const", start + 1);
    const body = checkoutSrc.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(body).toContain('import("./feed-visibility-access.server")');
    expect(body).toContain("canViewerSeeTier(");
  });
});
