import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet,
} from "@tanstack/react-router";

const signUpMock = vi.fn();
const signInMock = vi.fn();
const insertMock = vi.fn().mockResolvedValue({ error: null });
const oauthMock = vi.fn().mockResolvedValue({ error: null });
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const recordLegalMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...a: any[]) => signUpMock(...a),
      signInWithPassword: (...a: any[]) => signInMock(...a),
    },
    from: () => ({ insert: (...a: any[]) => insertMock(...a) }),
  },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: (...a: any[]) => oauthMock(...a) } },
}));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
const legalMarker = { __name: "acceptLegal" };
vi.mock("@/lib/legal-acceptance.functions", () => ({
  acceptLegal: legalMarker,
  LEGAL_ACCEPTANCE_VERSION: "2026-07-13",
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => recordLegalMock }));

import { RoleSignupForm } from "../RoleSignupForm";

async function renderForm() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <RoleSignupForm /> });
  const other = ["/app", "/secure/personas", "/legal/terms", "/legal/privacy", "/legal/acceptable-use", "/legal/ai-disclosure"].map((p) =>
    createRoute({ getParentRoute: () => rootRoute, path: p, component: () => <div>{p}</div> }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, ...other]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const utils = render(<RouterProvider router={router} />);
  await waitFor(() => expect(utils.container.querySelector("form")).not.toBeNull());
  return utils;
}

beforeEach(() => {
  signUpMock.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  signInMock.mockReset();
  insertMock.mockClear();
  toastErrorMock.mockClear();
  toastSuccessMock.mockClear();
  recordLegalMock.mockClear();
});
afterEach(() => cleanup());

describe("RoleSignupForm legal acceptance", () => {
  it("blocks signup and shows an error when the legal checkbox is not ticked", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("passes legal_accepted_at + version into auth user metadata and records the server audit entry", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept legal policies/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => expect(signUpMock).toHaveBeenCalled());
    const arg = signUpMock.mock.calls[0][0];
    expect(arg.email).toBe("a@b.co");
    expect(arg.options.data.legal_accepted_version).toBe("2026-07-13");
    expect(typeof arg.options.data.legal_accepted_at).toBe("string");
    expect(new Date(arg.options.data.legal_accepted_at).toString()).not.toBe("Invalid Date");

    // Server-side record → written to profile + audit_logs (visible in admin user log).
    await waitFor(() =>
      expect(recordLegalMock).toHaveBeenCalledWith({
        data: { version: "2026-07-13", context: "signup_form" },
      }),
    );
  });

  it("renders links to Terms, Privacy, Acceptable Use, and AI Disclosure", async () => {
    await renderForm();
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/legal/terms",
        "/legal/privacy",
        "/legal/acceptable-use",
        "/legal/ai-disclosure",
      ]),
    );
  });
});