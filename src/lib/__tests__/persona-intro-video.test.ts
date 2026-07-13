import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const introSrc = readFileSync(resolve(process.cwd(), "src/lib/persona-intro-video.functions.ts"), "utf8");
const vaultSrc = readFileSync(resolve(process.cwd(), "src/lib/content-vault.functions.ts"), "utf8");
const fanFeedSrc = readFileSync(resolve(process.cwd(), "src/lib/fan-feed.functions.ts"), "utf8");
const pollerSrc = readFileSync(resolve(process.cwd(), "src/routes/api/public/cron/venice-video-poll.ts"), "utf8");
const cardSrc = readFileSync(resolve(process.cwd(), "src/components/twinly/PersonaCard.tsx"), "utf8");
const routeSrc = readFileSync(resolve(process.cwd(), "src/routes/creators.$handle.tsx"), "utf8");

describe("content-vault.functions.ts exports reused by persona-intro-video (structural)", () => {
  it("assertPersonaHasRoom and resolveByteSize are exported, not module-private", () => {
    expect(vaultSrc).toContain("export async function assertPersonaHasRoom");
    expect(vaultSrc).toContain("export async function resolveByteSize");
  });
});

describe("uploadPersonaIntroVideo (structural)", () => {
  const start = introSrc.indexOf("export const uploadPersonaIntroVideo");
  const end = introSrc.indexOf("export const requestPersonaIntroVideoGeneration");
  const body = introSrc.slice(start, end);

  it("re-resolves the real byte size server-side and enforces the persona storage cap before inserting", () => {
    const resolveIdx = body.indexOf("resolveByteSize(");
    const capIdx = body.indexOf("assertPersonaHasRoom(");
    const insertIdx = body.indexOf(".insert({");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeGreaterThan(resolveIdx);
    expect(insertIdx).toBeGreaterThan(capIdx);
  });

  it("rejects a storage path not owned by the calling creator", () => {
    expect(body).toContain("if (!data.storagePath.startsWith(`${creator.id}/`))");
  });

  it("inserts as pending, requiring admin approval before public visibility, same as every other asset", () => {
    expect(body).toContain('approval_status: "pending"');
  });

  it("sets personas.intro_video_asset_id to the new asset after insert", () => {
    const insertIdx = body.indexOf(".insert({");
    const updateIdx = body.indexOf('.update({ intro_video_asset_id: asset.id })');
    expect(updateIdx).toBeGreaterThan(insertIdx);
  });
});

describe("requestPersonaIntroVideoGeneration (structural)", () => {
  const start = introSrc.indexOf("export const requestPersonaIntroVideoGeneration");
  const end = introSrc.indexOf("export type PersonaIntroVideoStatus");
  const body = introSrc.slice(start, end);

  it("requires an approved Digital Twin profile plus active likeness+video consent before calling Venice", () => {
    const twinCheckIdx = body.indexOf('creator.digital_twin_status !== "approved"');
    const consentCheckIdx = body.indexOf("consent.likeness_ok");
    const videoConsentIdx = body.indexOf("consent.video_ok");
    const queueCallIdx = body.indexOf("await queueVeniceVideo(");
    expect(twinCheckIdx).toBeGreaterThan(-1);
    expect(consentCheckIdx).toBeGreaterThan(twinCheckIdx);
    expect(videoConsentIdx).toBeGreaterThan(consentCheckIdx);
    expect(queueCallIdx).toBeGreaterThan(videoConsentIdx);
  });

  it("respects the forbidden-uses list", () => {
    expect(body).toContain('forbidden.includes("video")');
  });

  it("enforces the monthly spend cap before queuing", () => {
    const spendCheckIdx = body.indexOf("assertUnderSpendCap(");
    const queueCallIdx = body.indexOf("await queueVeniceVideo(");
    expect(spendCheckIdx).toBeGreaterThan(-1);
    expect(spendCheckIdx).toBeLessThan(queueCallIdx);
  });

  it("requests exactly a 10-second clip, not the generic 5s default used elsewhere", () => {
    expect(introSrc).toContain("INTRO_VIDEO_DURATION_SECONDS = 10");
    expect(body).toContain("durationSeconds: INTRO_VIDEO_DURATION_SECONDS");
  });

  it("inserts a content_assets row shaped exactly as the venice-video-poll cron expects (provider, provider_status, provider_job_id, provider_model)", () => {
    expect(body).toContain('provider: "venice_video"');
    expect(body).toContain('provider_status: "processing"');
    expect(body).toContain("provider_job_id: result.queueId");
    expect(body).toContain("provider_model: result.model");
  });

  it("still leaves approval_status pending — generation completing is not the same as being publicly approved", () => {
    expect(body).toContain('approval_status: "pending"');
  });
});

describe("venice-video-poll cron poller picks up intro-video rows with zero changes needed (structural)", () => {
  it("polls purely by provider + provider_status, with no category or feature-specific filter that would exclude intro-video rows", () => {
    const start = pollerSrc.indexOf("supabaseAdmin");
    const body = pollerSrc.slice(start, start + 500);
    expect(body).toContain('.eq("provider", "venice_video")');
    expect(body).toContain('.eq("provider_status", "processing")');
    expect(body).not.toContain("category");
  });
});

describe("getMyPersonaIntroVideoStatus (structural)", () => {
  const start = introSrc.indexOf("export const getMyPersonaIntroVideoStatus");
  const end = introSrc.indexOf("export const removePersonaIntroVideo");
  const body = introSrc.slice(start, end);

  it("only mints a preview signed URL for rows the creator owns (requireOwnedPersona gate before any asset read)", () => {
    const ownedIdx = body.indexOf("requireOwnedPersona(");
    const signedUrlIdx = body.indexOf("createSignedUrl(");
    expect(ownedIdx).toBeGreaterThan(-1);
    expect(signedUrlIdx).toBeGreaterThan(ownedIdx);
  });

  it("reports processing state before checking approval, so an in-flight render isn't mistaken for rejected/pending", () => {
    const processingIdx = body.indexOf('provider_status === "processing"');
    const approvedIdx = body.indexOf('approval_status === "approved"');
    expect(processingIdx).toBeGreaterThan(-1);
    expect(processingIdx).toBeLessThan(approvedIdx);
  });
});

describe("getPersonaIntroVideoUrl — public read path (structural)", () => {
  const start = fanFeedSrc.indexOf("export const getPersonaIntroVideoUrl");
  const nextExport = fanFeedSrc.indexOf("\nexport const getFanAssetUrl");
  const body = fanFeedSrc.slice(start, nextExport);

  it("has no auth middleware — the teaser must play for logged-out visitors too", () => {
    expect(body).not.toContain("requireSupabaseAuth");
  });

  it("re-checks persona visibility exactly like getPersonaFeed (public/subscribers/vip, or invite-only check)", () => {
    expect(body).toContain('["public", "subscribers", "vip"].includes(persona.visibility as string)');
    expect(body).toContain("checkPersonaInviteAccess");
  });

  it("never mints a URL for an asset that isn't approved — this is the actual security boundary, since duration/format checks are only soft client-side guards", () => {
    const approvalCheckIdx = body.indexOf('asset.approval_status !== "approved"');
    const signIdx = body.indexOf("createSignedUrl(");
    expect(approvalCheckIdx).toBeGreaterThan(-1);
    expect(signIdx).toBeGreaterThan(approvalCheckIdx);
  });

  it("refuses a removed/moderated asset even if approved", () => {
    expect(body).toContain('asset.moderation_status === "removed"');
  });

  it("returns null (not a thrown error) for every gating failure, so the client can render a clean fallback rather than an exception", () => {
    const returns = body.match(/return null;/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(4);
  });
});

describe("PersonaCard video-icon badge (structural)", () => {
  it("stops propagation and prevents default so clicking the badge never triggers the card's own navigation", () => {
    const start = cardSrc.indexOf("hasIntroVideo &&");
    const body = cardSrc.slice(start, start + 400);
    expect(body).toContain("e.preventDefault()");
    expect(body).toContain("e.stopPropagation()");
  });
});

describe("creators.$handle.tsx hasIntroVideo wiring (structural)", () => {
  it("only marks hasIntroVideo true when the linked asset is actually approved, not merely linked", () => {
    expect(routeSrc).toContain('a.approval_status === "approved"');
    expect(routeSrc).toContain("approvedIntroAssetIds.has(p.intro_video_asset_id)");
  });
});
