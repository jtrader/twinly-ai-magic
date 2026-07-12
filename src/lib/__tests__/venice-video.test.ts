import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectVeniceVideoModel } from "../venice.server";

const veniceSrc = readFileSync(resolve(process.cwd(), "src/lib/venice.server.ts"), "utf8");
const generateReqSrc = readFileSync(resolve(process.cwd(), "src/lib/generate-requests.functions.ts"), "utf8");
const cronSrc = readFileSync(resolve(process.cwd(), "src/routes/api/public/cron/venice-video-poll.ts"), "utf8");

describe("selectVeniceVideoModel (pure)", () => {
  it("picks text-to-video when there are no reference images", () => {
    expect(selectVeniceVideoModel(false)).toBe("seedance-2-0-text-to-video");
  });

  it("picks reference-to-video when reference images are present", () => {
    expect(selectVeniceVideoModel(true)).toBe("seedance-2-0-reference-to-video");
  });

  it("picks the fast variant of each when requested", () => {
    expect(selectVeniceVideoModel(false, true)).toBe("seedance-2-0-fast-text-to-video");
    expect(selectVeniceVideoModel(true, true)).toBe("seedance-2-0-fast-reference-to-video");
  });
});

describe("Seedance face-media consent attestation (structural)", () => {
  it("sends exactly the three required fields, all literal true, matching Venice's documented consent object", () => {
    const start = veniceSrc.indexOf("export async function queueVeniceVideo");
    const nextExport = veniceSrc.indexOf("\nexport ", start + 1);
    const body = veniceSrc.slice(start, nextExport);
    const match = body.match(/seedance:\s*\{([^}]*)\}/s);
    expect(match).not.toBeNull();
    const fields = match![1];
    expect(fields).toMatch(/confirmed_terms_and_privacy:\s*true/);
    expect(fields).toMatch(/confirmed_legal_right:\s*true/);
    expect(fields).toMatch(/confirmed_screening_acknowledged:\s*true/);
    // No extra fields (e.g. a client-picked consent_version) — Venice rejects those with a 400.
    expect(fields).not.toContain("consent_version");
  });

  it("only retries with a consent attestation for Venice's documented face-eligible models, and only on needs_consent", () => {
    const start = veniceSrc.indexOf("export async function queueVeniceVideo");
    const nextExport = veniceSrc.indexOf("\nexport ", start + 1);
    const body = veniceSrc.slice(start, nextExport);
    expect(body).toContain("FACE_ELIGIBLE_MODELS.has(model)");
    expect(body).toContain('errJson?.error?.code !== "needs_consent"');
  });

  it("declares the face-eligible model set exactly as Venice documents it", () => {
    expect(veniceSrc).toMatch(/FACE_ELIGIBLE_MODELS = new Set\(\[/);
    for (const m of [
      "seedance-2-0-image-to-video",
      "seedance-2-0-reference-to-video",
      "seedance-2-0-fast-image-to-video",
      "seedance-2-0-fast-reference-to-video",
    ]) {
      expect(veniceSrc).toContain(`"${m}"`);
    }
  });
});

describe("applyVeniceVideoOutcome mirrors the HeyGen outcome pattern (structural)", () => {
  const start = veniceSrc.indexOf("export async function applyVeniceVideoOutcome");
  const body = veniceSrc.slice(start);

  it("re-checks digital_twin_consent (video_ok + likeness_ok, signed, not revoked) before finalizing a success", () => {
    expect(body).toContain('.from("digital_twin_consent")');
    expect(body).toContain("video_ok");
    expect(body).toContain("likeness_ok");
    expect(body).toContain("consent?.revoked_at");
  });

  it("dedupes an already-finalized asset instead of re-uploading on a repeat success signal", () => {
    expect(body).toContain('outcome.kind === "success"');
    expect(body).toMatch(/storage_path.*&&.*outcome\.kind === "success"/s);
  });

  it("never sets approval_status to approved on success — video still needs human moderation review", () => {
    const successSection = body.slice(body.indexOf("const path = "));
    expect(successSection).not.toContain('approval_status: "approved"');
  });
});

describe("video generation wiring in generate-requests.functions.ts (structural)", () => {
  it("the video branch runs after assertTwinPolicy, never bypassing the consent/persona/pack gate", () => {
    const policyIdx = generateReqSrc.indexOf("const policy = await assertTwinPolicy(");
    const videoIdx = generateReqSrc.indexOf("if (isVeniceVideo) {");
    expect(policyIdx).toBeGreaterThan(-1);
    expect(videoIdx).toBeGreaterThan(-1);
    expect(policyIdx).toBeLessThan(videoIdx);
  });

  it("counts video spend toward the same monthly generation cap as images", () => {
    expect(generateReqSrc).toContain(
      'const isVeniceSpend = req.output_type === "image" || req.output_type === "promo_banner" || req.output_type === "video";',
    );
  });

  it("caps how many videos a single publish can submit, unlike unrestricted quantity elsewhere", () => {
    const start = generateReqSrc.indexOf("if (isVeniceVideo) {");
    const body = generateReqSrc.slice(start, start + 3000);
    expect(body).toMatch(/Math\.min\(4, Math\.floor\(req\.quantity\)\)/);
  });

  it("inserted video rows start pending, not auto-approved like completed images", () => {
    const start = generateReqSrc.indexOf("if (isVeniceVideo) {");
    const end = generateReqSrc.indexOf("} else if (isVeniceImage)");
    const body = generateReqSrc.slice(start, end);
    expect(body).toContain('approval_status: "pending"');
    expect(body).toContain('provider_status: "processing"');
  });
});

describe("Venice video cron poller (structural)", () => {
  it("requires the same secret-bearer auth pattern as the existing HeyGen poller", () => {
    expect(cronSrc).toContain("VENICE_VIDEO_POLL_SECRET");
    expect(cronSrc).toMatch(/auth\.startsWith\("Bearer "\)/);
    expect(cronSrc).toContain("provided !== secret");
  });

  it("only polls rows actually still processing for this provider", () => {
    expect(cronSrc).toContain('.eq("provider", "venice_video")');
    expect(cronSrc).toContain('.eq("provider_status", "processing")');
  });

  it("routes both completed and failed outcomes through applyVeniceVideoOutcome, not a separate ad hoc handler", () => {
    const occurrences = cronSrc.match(/applyVeniceVideoOutcome\(/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});
