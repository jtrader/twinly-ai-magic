import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mocks — hoisted so they run before the component's imports execute.
const h = vi.hoisted(() => ({
  verifyAgeMock: vi.fn().mockResolvedValue({ ok: true }),
  acceptLegalMock: vi.fn().mockResolvedValue({ ok: true }),
  verifyAgeMarker: { __name: "verifyAge" },
  acceptLegalMarker: { __name: "acceptLegal" },
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => (fn === h.verifyAgeMarker ? h.verifyAgeMock : h.acceptLegalMock),
}));
vi.mock("@/lib/age-gate.functions", () => ({ verifyAge: h.verifyAgeMarker }));
vi.mock("@/lib/legal-acceptance.functions", () => ({
  acceptLegal: h.acceptLegalMarker,
  LEGAL_ACCEPTANCE_VERSION: "2026-07-13",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } },
}));

import { AgeGateDialog, AGE_GATE_STORAGE_KEY, LEGAL_STORAGE_KEY } from "../AgeGateDialog";

beforeEach(() => {
  localStorage.clear();
  h.verifyAgeMock.mockClear();
  h.acceptLegalMock.mockClear();
});
afterEach(() => cleanup());

describe("AgeGateDialog", () => {
  it("disables the accept button until the checkbox is ticked, then persists to localStorage", async () => {
    render(<AgeGateDialog />);
    const accept = await screen.findByRole("button", { name: /I'm 18\+ and I accept/i });
    expect(accept).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Accept legal policies/i }));
    expect(accept).not.toBeDisabled();

    fireEvent.click(accept);
    await waitFor(() => {
      expect(localStorage.getItem(AGE_GATE_STORAGE_KEY)).not.toBeNull();
      expect(localStorage.getItem(LEGAL_STORAGE_KEY)).not.toBeNull();
    });
    const stored = JSON.parse(localStorage.getItem(LEGAL_STORAGE_KEY)!);
    expect(stored.version).toBe("2026-07-13");
    expect(typeof stored.at).toBe("string");
    expect(new Date(stored.at).toString()).not.toBe("Invalid Date");

    // Server-authoritative record for the admin user log.
    expect(h.acceptLegalMock).toHaveBeenCalledWith({
      data: { version: "2026-07-13", context: "age_gate_dialog" },
    });
  });

  it("does not re-open after 'refresh' when localStorage already has an acceptance record", async () => {
    localStorage.setItem(
      AGE_GATE_STORAGE_KEY,
      JSON.stringify({ at: new Date().toISOString(), version: "2026-07-13" }),
    );
    render(<AgeGateDialog />);
    // Dialog is controlled by internal state; skipping the useEffect open means
    // the title never renders.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Age check & legal acceptance/i)).toBeNull();
  });

  it("renders links to Terms, Privacy, Acceptable Use, and AI Disclosure", async () => {
    render(<AgeGateDialog />);
    await screen.findByRole("button", { name: /I'm 18\+ and I accept/i });
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/legal/terms",
        "/legal/privacy",
        "/legal/acceptable-use",
        "/legal/ai-disclosure",
      ]),
    );
    // Open in a new tab so users don't lose the age gate mid-flow.
    for (const a of Array.from(document.querySelectorAll("a"))) {
      expect(a.getAttribute("target")).toBe("_blank");
    }
  });
});