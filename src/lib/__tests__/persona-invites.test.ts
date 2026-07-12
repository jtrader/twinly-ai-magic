import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasAcceptedInvite } from "../persona-invites.functions";

const invitesSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-invites.functions.ts"), "utf8");
const fanFeedSrc = readFileSync(resolve(process.cwd(), "src/lib/fan-feed.functions.ts"), "utf8");
const chatFnSrc = readFileSync(resolve(process.cwd(), "src/lib/chat.functions.ts"), "utf8");
const chatRouteSrc = readFileSync(resolve(process.cwd(), "src/routes/chat.$handle.$persona.tsx"), "utf8");
const studioFnSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-studio.functions.ts"), "utf8");

describe("hasAcceptedInvite (pure)", () => {
  it("is false for an anonymous viewer", () => {
    expect(hasAcceptedInvite(["fan-1", "fan-2"], null)).toBe(false);
  });

  it("is true when the viewer is in the accepted list", () => {
    expect(hasAcceptedInvite(["fan-1", "fan-2"], "fan-2")).toBe(true);
  });

  it("is false when the viewer isn't in the accepted list", () => {
    expect(hasAcceptedInvite(["fan-1", "fan-2"], "fan-3")).toBe(false);
  });

  it("is false against an empty list", () => {
    expect(hasAcceptedInvite([], "fan-1")).toBe(false);
  });
});

describe("acceptPersonaInvite guards against reuse/revocation (structural)", () => {
  it("rejects a revoked invite outright", () => {
    const start = invitesSrc.indexOf("export const acceptPersonaInvite");
    const body = invitesSrc.slice(start);
    expect(body).toContain('invite.status === "revoked"');
  });

  it("rejects claiming an invite already accepted by a different fan", () => {
    const start = invitesSrc.indexOf("export const acceptPersonaInvite");
    const body = invitesSrc.slice(start);
    expect(body).toContain("invite.invited_fan_id && invite.invited_fan_id !== userId");
  });
});

describe("invite_only enforcement wiring (structural)", () => {
  it("getPersonaFeed treats invite_only as gated — owner or accepted invite only, otherwise not-found", () => {
    const start = fanFeedSrc.indexOf("export const getPersonaFeed");
    const body = fanFeedSrc.slice(start);
    expect(body).toContain('persona.visibility === "invite_only"');
    expect(body).toContain("checkPersonaInviteAccess");
  });

  it("invite_only assets don't additionally require a subscription tier", () => {
    const start = fanFeedSrc.indexOf("function assetAccess");
    const end = fanFeedSrc.indexOf("export const getPersonaFeed");
    const body = fanFeedSrc.slice(start, end);
    expect(body).toContain('opts.personaVisibility === "subscribers" || opts.personaVisibility === "vip"');
    expect(body).not.toContain('opts.personaVisibility !== "public"');
  });

  it("the chat route loader gates invite_only personas behind owner-or-accepted-invite", () => {
    const start = chatRouteSrc.indexOf("const loadPersonaChat");
    const body = chatRouteSrc.slice(start, start + 2000);
    expect(body).toContain('persona.visibility === "invite_only"');
    expect(body).toContain("checkPersonaInviteAccess");
    expect(body).toContain("isOwner");
  });

  it("ensurePersonaConversation checks invite access before creating a conversation", () => {
    const start = chatFnSrc.indexOf("export const ensurePersonaConversation");
    const end = chatFnSrc.indexOf("requireConversationAccess");
    const body = chatFnSrc.slice(start, end);
    expect(body).toContain('(persona as any).visibility === "invite_only"');
    expect(body).toContain("checkPersonaInviteAccess");
  });

  it("sendPersonaMessage re-checks invite access on every send, not just at conversation creation", () => {
    const start = chatFnSrc.indexOf("export const sendPersonaMessage");
    const end = chatFnSrc.indexOf("export const loadConversation");
    const body = chatFnSrc.slice(start, end);
    expect(body).toContain('(persona as any).visibility === "invite_only"');
    expect(body).toContain("checkPersonaInviteAccess");
  });

  it("invite_only is a fan-facing visibility tier — still requires creator verification + boundary rules to publish", () => {
    expect(studioFnSrc).toContain('new Set(["public", "subscribers", "vip", "invite_only"])');
  });
});
