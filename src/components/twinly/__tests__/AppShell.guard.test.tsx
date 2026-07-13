import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";

// --- Mocks -----------------------------------------------------------------
// Drive user + roles per-test so we can simulate anon / supporter / creator /
// agency / admin viewers hitting each dashboard path.
let mockUser: { id: string; email: string } | null = null;
let mockRoles: string[] = [];
vi.mock("@/lib/session", () => ({
  useSession: () => ({ user: mockUser, session: null, loading: false }),
  useUserRoles: () => mockRoles,
}));

// Silence toast side-effects — the guard shows one when access is denied.
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn(), message: vi.fn() },
}));

// AppShell pulls in a lot of unrelated chrome (billing portal, notification
// bell, impersonation banner, dashboard nav, ...). Stub them so the test
// stays focused on the guard's redirect policy.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/lib/checkout.functions", () => ({ createBillingPortal: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripeEnvironment: () => "test",
  isPaymentsConfigured: () => false,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/components/twinly/ImpersonationBanner", () => ({
  ImpersonationBanner: () => null,
  setImpersonationContext: vi.fn(),
}));
vi.mock("@/components/twinly/AdminViewSwitcher", () => ({ AdminViewSwitcher: () => null }));
vi.mock("@/components/twinly/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/twinly/PaymentTestModeBanner", () => ({ PaymentTestModeBanner: () => null }));
vi.mock("@/components/twinly/DashboardNav", () => ({ DashboardNav: () => null }));

import { AppShell } from "../AppShell";

// Render <AppShell> at `pathname` inside a memory router that has stub routes
// for every destination the guard can redirect to. Any pathname change is the
// guard firing.
async function renderAt(pathname: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const paths = [
    "/", "/auth", "/app",
    "/admin", "/agency", "/studio", "/studio/personas", "/studio/agency",
    "/secure/personas", "/fan", "/account", "/account/subscriptions",
    "/discover", "/pricing", "/onboarding",
  ];
  const routes = paths.map((p) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: p,
      component: () => (
        <AppShell mobileNav={false}>
          <div data-testid={`page-${p}`}>{p}</div>
        </AppShell>
      ),
    }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const at = (router: any) => router.state.location.pathname;

beforeEach(() => {
  mockUser = null;
  mockRoles = [];
  toastErrorMock.mockReset();
});

describe("AppShell dashboard role guard", () => {
  describe("anonymous viewer", () => {
    it.each(["/admin", "/agency", "/studio", "/studio/personas", "/secure/personas", "/fan", "/account", "/app", "/onboarding"])(
      "redirects to /auth from %s",
      async (path) => {
        const router = await renderAt(path);
        await waitFor(() => expect(at(router)).toBe("/auth"));
      },
    );

    it("does NOT redirect from public pages (/discover, /pricing, /)", async () => {
      for (const p of ["/discover", "/pricing", "/"]) {
        const router = await renderAt(p);
        // Give the effect a tick — nothing should happen.
        await new Promise((r) => setTimeout(r, 20));
        expect(at(router)).toBe(p);
      }
    });
  });

  describe("supporter (fan role)", () => {
    beforeEach(() => { mockUser = { id: "u1", email: "s@x" }; mockRoles = ["fan"]; });

    it.each([
      ["/admin", "/app"],
      ["/agency", "/app"],
      ["/studio", "/app"],
      ["/studio/personas", "/app"],
      ["/secure/personas", "/app"],
    ])("redirects %s -> %s and shows a denial toast", async (from, to) => {
      const router = await renderAt(from);
      await waitFor(() => expect(at(router)).toBe(to));
      expect(toastErrorMock).toHaveBeenCalled();
    });

    it.each(["/fan", "/account", "/app"])("allows supporter surface %s", async (p) => {
      const router = await renderAt(p);
      await new Promise((r) => setTimeout(r, 20));
      expect(at(router)).toBe(p);
      expect(toastErrorMock).not.toHaveBeenCalled();
    });
  });

  describe("creator", () => {
    beforeEach(() => { mockUser = { id: "u2", email: "c@x" }; mockRoles = ["fan", "creator"]; });

    it.each(["/studio", "/studio/personas", "/studio/agency", "/secure/personas", "/fan", "/account", "/app"])(
      "allows creator surface %s",
      async (p) => {
        const router = await renderAt(p);
        await new Promise((r) => setTimeout(r, 20));
        expect(at(router)).toBe(p);
        expect(toastErrorMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["/admin", "/studio"],
      ["/agency", "/studio"],
    ])("redirects %s -> %s (best-fit landing = /studio)", async (from, to) => {
      const router = await renderAt(from);
      await waitFor(() => expect(at(router)).toBe(to));
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  describe("agency owner", () => {
    beforeEach(() => { mockUser = { id: "u3", email: "a@x" }; mockRoles = ["fan", "agency"]; });

    it("allows /agency", async () => {
      const router = await renderAt("/agency");
      await new Promise((r) => setTimeout(r, 20));
      expect(at(router)).toBe("/agency");
    });

    it.each([
      ["/admin", "/agency"],
      ["/studio", "/agency"],
      ["/secure/personas", "/agency"],
    ])("redirects %s -> %s (best-fit landing = /agency)", async (from, to) => {
      const router = await renderAt(from);
      await waitFor(() => expect(at(router)).toBe(to));
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  describe("admin", () => {
    beforeEach(() => { mockUser = { id: "u4", email: "adm@x" }; mockRoles = ["admin"]; });

    it.each(["/admin", "/agency", "/studio", "/studio/personas", "/secure/personas", "/fan", "/account", "/app"])(
      "allows admin on %s (admin passes every role gate)",
      async (p) => {
        const router = await renderAt(p);
        await new Promise((r) => setTimeout(r, 20));
        expect(at(router)).toBe(p);
        expect(toastErrorMock).not.toHaveBeenCalled();
      },
    );
  });
});