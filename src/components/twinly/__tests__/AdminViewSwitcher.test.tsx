import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";

// Session hook is mocked so tests don't touch Supabase. We drive both the
// user and the returned roles per-test to cover the admin gate and the
// hide-inside-admin behaviour.
let mockUser: { id: string } | null = { id: "admin-user" };
let mockRoles: string[] = ["admin"];
vi.mock("@/lib/session", () => ({
  useSession: () => ({ user: mockUser, session: null, loading: false }),
  useUserRoles: () => mockRoles,
}));

import { AdminViewSwitcher } from "../AdminViewSwitcher";

// Renders the switcher inside a real TanStack Router with the three routes
// it links to (/app, /studio, /agency) plus /admin (to test the hide rule)
// so <Link>s resolve and clicks actually change the pathname.
async function renderAt(pathname: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AdminViewSwitcher />
        <Outlet />
      </>
    ),
  });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <div>home</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/app", component: () => <div data-testid="page-app">supporter view</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/studio", component: () => <div data-testid="page-studio">creator view</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/studio/personas", component: () => <div data-testid="page-studio-personas">studio child</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/agency", component: () => <div data-testid="page-agency">agency view</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: () => <div data-testid="page-admin">admin console</div> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/discover", component: () => <div data-testid="page-discover">discover</div> }),
  ];
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const utils = render(<RouterProvider router={router} />);
  await waitFor(() => expect(utils.container.firstChild).not.toBeNull());
  return { ...utils, router };
}

beforeEach(() => {
  mockUser = { id: "admin-user" };
  mockRoles = ["admin"];
});

describe("AdminViewSwitcher", () => {
  it("renders nothing when the viewer is not signed in", async () => {
    mockUser = null;
    const { container } = await renderAt("/app");
    expect(container.querySelector('[aria-label="Admin role preview switcher"]')).toBeNull();
  });

  it("renders nothing when the viewer is signed in but lacks the admin role", async () => {
    mockRoles = ["fan"];
    const { container } = await renderAt("/app");
    expect(container.querySelector('[aria-label="Admin role preview switcher"]')).toBeNull();
  });

  it("renders three view buttons (Supporter, Creator, Agency) plus an Admin console link for admins", async () => {
    await renderAt("/discover");
    const nav = screen.getByLabelText("Admin role preview switcher");
    // Each label lives in aria-label to keep the visible chip compact.
    expect(within(nav).getByLabelText("Supporter view")).toBeInTheDocument();
    expect(within(nav).getByLabelText("Creator view")).toBeInTheDocument();
    expect(within(nav).getByLabelText("Agency view")).toBeInTheDocument();
    // Admin console shortcut is present so admins can bounce back to /admin
    // from any preview surface in one click.
    expect(within(nav).getByRole("link", { name: /admin console/i })).toBeInTheDocument();
  });

  it("hides itself inside the /admin console (the console has its own nav)", async () => {
    const { container } = await renderAt("/admin");
    expect(container.querySelector('[aria-label="Admin role preview switcher"]')).toBeNull();
  });

  it("highlights Supporter as the active view on /app (and its sibling supporter surfaces)", async () => {
    await renderAt("/app");
    const supporter = screen.getByLabelText("Supporter view");
    expect(supporter.getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Creator view").getAttribute("aria-current")).toBeNull();
    expect(screen.getByLabelText("Agency view").getAttribute("aria-current")).toBeNull();
  });

  it("highlights Creator when the pathname is /studio OR a nested studio child (e.g. /studio/personas)", async () => {
    await renderAt("/studio/personas");
    const creator = screen.getByLabelText("Creator view");
    expect(creator.getAttribute("aria-current")).toBe("page");
    // Ensure the match logic is prefix-scoped, not literal.
    expect(screen.getByLabelText("Supporter view").getAttribute("aria-current")).toBeNull();
    expect(screen.getByLabelText("Agency view").getAttribute("aria-current")).toBeNull();
  });

  it("highlights Agency on /agency and none of the other views", async () => {
    await renderAt("/agency");
    expect(screen.getByLabelText("Agency view").getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("Supporter view").getAttribute("aria-current")).toBeNull();
    expect(screen.getByLabelText("Creator view").getAttribute("aria-current")).toBeNull();
  });

  it("clicking Creator navigates to /studio and renders the studio page", async () => {
    const { router } = await renderAt("/app");
    fireEvent.click(screen.getByLabelText("Creator view"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio"));
    expect(await screen.findByTestId("page-studio")).toBeInTheDocument();
  });

  it("clicking Supporter navigates to /app and renders the supporter page", async () => {
    const { router } = await renderAt("/studio");
    fireEvent.click(screen.getByLabelText("Supporter view"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(await screen.findByTestId("page-app")).toBeInTheDocument();
  });

  it("clicking Agency navigates to /agency and renders the agency page", async () => {
    const { router } = await renderAt("/app");
    fireEvent.click(screen.getByLabelText("Agency view"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/agency"));
    expect(await screen.findByTestId("page-agency")).toBeInTheDocument();
  });

  it("each view link's href resolves to the correct top-level route", async () => {
    await renderAt("/discover");
    expect(screen.getByLabelText("Supporter view").getAttribute("href")).toBe("/app");
    expect(screen.getByLabelText("Creator view").getAttribute("href")).toBe("/studio");
    expect(screen.getByLabelText("Agency view").getAttribute("href")).toBe("/agency");
  });
});