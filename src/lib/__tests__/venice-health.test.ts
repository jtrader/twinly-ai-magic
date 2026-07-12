import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const healthSrc = readFileSync(resolve(process.cwd(), "src/lib/venice-health.functions.ts"), "utf8");
const adminSrc = readFileSync(resolve(process.cwd(), "src/routes/admin.tsx"), "utf8");

describe("adminTestVeniceConnection (structural)", () => {
  it("is admin-gated before doing anything else", () => {
    const start = healthSrc.indexOf("export const adminTestVeniceConnection");
    const body = healthSrc.slice(start);
    const requireAdminIdx = body.indexOf("requireAdmin(context)");
    const envCheckIdx = body.indexOf("process.env.VENICE_API_KEY");
    expect(requireAdminIdx).toBeGreaterThan(-1);
    expect(envCheckIdx).toBeGreaterThan(requireAdminIdx);
  });

  it("checks env presence before ever calling into venice.server.ts", () => {
    const start = healthSrc.indexOf("export const adminTestVeniceConnection");
    const body = healthSrc.slice(start);
    const envCheckIdx = body.indexOf("if (!hasKey || !hasModel)");
    const importIdx = body.indexOf('import("./venice.server")');
    expect(envCheckIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeGreaterThan(envCheckIdx);
  });

  it("never triggers image or video generation — only the chat completion path", () => {
    expect(healthSrc).not.toContain("generateVeniceImages");
    expect(healthSrc).not.toContain("queueVeniceVideo");
    expect(healthSrc).toContain("generateVeniceChatReply");
  });

  it("sends a trivial, cheap prompt rather than anything substantial", () => {
    const start = healthSrc.indexOf("generateVeniceChatReply({");
    const body = healthSrc.slice(start, start + 200);
    expect(body).toContain("ping");
    expect(body).toContain("Reply with exactly one word.");
  });

  it("reports which specific env vars are missing rather than a generic failure", () => {
    expect(healthSrc).toContain('"VENICE_API_KEY"');
    expect(healthSrc).toContain('"VENICE_CHAT_MODEL"');
    expect(healthSrc).toContain("missing:");
  });
});

describe("admin.tsx Venice tab (structural)", () => {
  it("is a distinct tab from 'providers' (the compliance-record log), not folded into it", () => {
    expect(adminSrc).toContain('"venice"');
    const providersIdx = adminSrc.indexOf('tab === "providers"');
    const veniceIdx = adminSrc.indexOf('tab === "venice"');
    expect(providersIdx).toBeGreaterThan(-1);
    expect(veniceIdx).toBeGreaterThan(providersIdx);
  });

  it("wires adminTestVeniceConnection via useServerFn, not a raw fetch", () => {
    expect(adminSrc).toContain("useServerFn(adminTestVeniceConnection)");
  });
});
