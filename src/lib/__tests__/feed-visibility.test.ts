import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_DEFAULT_TIER,
  canViewerSeeTier,
  resolveFeedItemVisibility,
  resolveFeedManagerRole,
} from "../feed-visibility-access.server";

describe("resolveFeedManagerRole (RBAC matrix)", () => {
  it("admin with no ownership/agency relationship gets the admin role", () => {
    const role = resolveFeedManagerRole({
      isAdmin: true,
      callerId: "user-1",
      creatorOwnerUserId: "someone-else",
      agencyManagesCreator: false,
    });
    expect(role).toBe("admin");
  });

  it("the creator who owns the target creator row gets the creator role", () => {
    const role = resolveFeedManagerRole({
      isAdmin: false,
      callerId: "user-1",
      creatorOwnerUserId: "user-1",
      agencyManagesCreator: false,
    });
    expect(role).toBe("creator");
  });

  it("an agency assigned to the creator via agency_creators gets the agency role", () => {
    const role = resolveFeedManagerRole({
      isAdmin: false,
      callerId: "agency-owner-1",
      creatorOwnerUserId: "some-creator-user",
      agencyManagesCreator: true,
    });
    expect(role).toBe("agency");
  });

  it("ownership takes priority over admin when both apply (records the more specific capacity)", () => {
    const role = resolveFeedManagerRole({
      isAdmin: true,
      callerId: "user-1",
      creatorOwnerUserId: "user-1",
      agencyManagesCreator: false,
    });
    expect(role).toBe("creator");
  });

  it("agency assignment takes priority over admin when both apply", () => {
    const role = resolveFeedManagerRole({
      isAdmin: true,
      callerId: "agency-owner-1",
      creatorOwnerUserId: "some-creator-user",
      agencyManagesCreator: true,
    });
    expect(role).toBe("agency");
  });

  it("a supporter/fan with none of admin/ownership/agency is rejected (null)", () => {
    const role = resolveFeedManagerRole({
      isAdmin: false,
      callerId: "fan-1",
      creatorOwnerUserId: "some-creator-user",
      agencyManagesCreator: false,
    });
    expect(role).toBeNull();
  });

  it("a creator acting on a creator they don't own is rejected, even if they own a different one", () => {
    const role = resolveFeedManagerRole({
      isAdmin: false,
      callerId: "creator-A",
      creatorOwnerUserId: "creator-B", // the target creator is owned by someone else
      agencyManagesCreator: false,
    });
    expect(role).toBeNull();
  });

  it("an agency not assigned to this specific creator is rejected, even if they manage others", () => {
    const role = resolveFeedManagerRole({
      isAdmin: false,
      callerId: "agency-owner-1",
      creatorOwnerUserId: "some-creator-user",
      agencyManagesCreator: false, // not assigned to *this* creator
    });
    expect(role).toBeNull();
  });
});

describe("resolveFeedItemVisibility (resolution order)", () => {
  it("an item override wins over the persona default", () => {
    expect(
      resolveFeedItemVisibility({ overrideTier: "public", personaDefaultTier: "subscribers_only" }),
    ).toBe("public");
  });

  it("falls back to the persona default when there is no override", () => {
    expect(
      resolveFeedItemVisibility({ overrideTier: null, personaDefaultTier: "logged_in" }),
    ).toBe("logged_in");
  });

  it("falls back to the platform default when neither an override nor a persona default exists", () => {
    expect(resolveFeedItemVisibility({ overrideTier: null, personaDefaultTier: null })).toBe(PLATFORM_DEFAULT_TIER);
    expect(PLATFORM_DEFAULT_TIER).toBe("subscribers_only"); // public visitors see nothing by default
  });
});

describe("canViewerSeeTier", () => {
  it("public tier is visible to everyone", () => {
    expect(canViewerSeeTier("public", { isAuthed: false, isPayingSubscriber: false })).toBe(true);
    expect(canViewerSeeTier("public", { isAuthed: true, isPayingSubscriber: false })).toBe(true);
    expect(canViewerSeeTier("public", { isAuthed: true, isPayingSubscriber: true })).toBe(true);
  });

  it("logged_in tier hides from anonymous visitors only", () => {
    expect(canViewerSeeTier("logged_in", { isAuthed: false, isPayingSubscriber: false })).toBe(false);
    expect(canViewerSeeTier("logged_in", { isAuthed: true, isPayingSubscriber: false })).toBe(true);
    expect(canViewerSeeTier("logged_in", { isAuthed: true, isPayingSubscriber: true })).toBe(true);
  });

  it("subscribers_only tier is visible only to paying subscribers", () => {
    expect(canViewerSeeTier("subscribers_only", { isAuthed: false, isPayingSubscriber: false })).toBe(false);
    expect(canViewerSeeTier("subscribers_only", { isAuthed: true, isPayingSubscriber: false })).toBe(false);
    expect(canViewerSeeTier("subscribers_only", { isAuthed: true, isPayingSubscriber: true })).toBe(true);
  });
});

describe("permission enforcement wiring (structural)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/feed-visibility.functions.ts"), "utf8");

  it.each([
    "setPersonaDefaultVisibility",
    "setFeedItemVisibilityOverride",
    "clearFeedItemVisibilityOverride",
    "bulkSetFeedItemVisibility",
  ])("%s checks requireFeedManagerRole before mutating", (fnName) => {
    const start = src.indexOf(`export const ${fnName}`);
    expect(start).toBeGreaterThan(-1);
    const nextExport = src.indexOf("\nexport const", start + 1);
    const body = src.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(body).toContain("requireFeedManagerRole(");
  });

  it("listFeedVisibilityAuditLog scopes non-admin callers to their own/managed creators, never returning unscoped rows", () => {
    const start = src.indexOf("export const listFeedVisibilityAuditLog");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start);
    // The only unscoped path is `isAdmin && !data.creatorId`; every other
    // branch resolves a concrete, ownership-checked creatorIds list before
    // querying the log.
    expect(body).toContain("requireFeedManagerRole(");
    expect(body).toContain("isAdmin && !data.creatorId");
  });
});

describe("audit log append-only guarantee (structural)", () => {
  it("the migration grants no UPDATE/DELETE on feed_visibility_audit_log to any role, and defines no such policy", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260711215549_feed_visibility.sql"),
      "utf8",
    );
    const auditSection = migration.slice(migration.indexOf("CREATE TABLE public.feed_visibility_audit_log"));

    expect(auditSection).not.toMatch(/GRANT[^;]*\bUPDATE\b[^;]*feed_visibility_audit_log/i);
    expect(auditSection).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*feed_visibility_audit_log/i);
    expect(auditSection).not.toMatch(/FOR UPDATE/i);
    expect(auditSection).not.toMatch(/FOR DELETE/i);
  });

  it("no server function exposes an update or delete route for the audit log", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/feed-visibility.functions.ts"), "utf8");
    expect(src).not.toMatch(/feed_visibility_audit_log.*\.(update|delete)\(/);
    expect(src.toLowerCase()).not.toContain("updatefeedvisibilityauditlog");
    expect(src.toLowerCase()).not.toContain("deletefeedvisibilityauditlog");
  });
});
