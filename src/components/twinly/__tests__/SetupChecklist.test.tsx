import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { SetupChecklist, type ChecklistStep } from "../SetupChecklist";

// Minimal in-memory router so <Link to="/studio/twin-onboarding" search={{ step: 2 }} />
// actually resolves — otherwise TanStack Router throws on render.
async function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <>{ui}</> });
  const twinRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/studio/twin-onboarding",
    validateSearch: (s: Record<string, unknown>) => ({ step: s.step ? Number(s.step) : undefined }),
    component: () => <div>twin onboarding</div>,
  });
  const realMeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/studio/real-me", component: () => <div>real me</div> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, twinRoute, realMeRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const utils = render(<RouterProvider router={router} />);
  // TanStack RouterProvider hydrates asynchronously; wait for the first
  // route match to actually mount our children.
  await waitFor(() => expect(utils.container.querySelector("ol")).not.toBeNull());
  return { ...utils, router };
}

function baseStep(overrides: Partial<ChecklistStep> = {}): ChecklistStep {
  return {
    key: "s",
    title: "A step",
    to: "/studio/real-me",
    done: false,
    why: "why", who: "who", what: "what", how: "how",
    ...overrides,
  };
}

describe("SetupChecklist", () => {
  it("marks completed steps done, strikes them through, and highlights the next incomplete step", async () => {
    const steps: ChecklistStep[] = [
      baseStep({ key: "profile", title: "Profile", done: true, statusReason: "Signed in as @x", statusTone: "ok" }),
      baseStep({ key: "real-me", title: "Real Me", done: false }),
      baseStep({ key: "twin", title: "Twin", done: false }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);

    const profile = screen.getByTestId("checklist-step-profile");
    expect(profile.getAttribute("data-done")).toBe("true");
    expect(within(profile).getByText("Profile").className).toMatch(/line-through/);

    const next = screen.getByTestId("checklist-step-real-me");
    expect(next.getAttribute("data-next")).toBe("true");
    expect(next.getAttribute("aria-current")).toBe("step");

    const later = screen.getByTestId("checklist-step-twin");
    expect(later.getAttribute("data-next")).toBe("false");

    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  });

  it("renders status reason with the requested tone (verified / awaiting review / error)", async () => {
    const steps: ChecklistStep[] = [
      baseStep({ key: "venice", title: "Venice", done: true, statusReason: "Verified — Alan Watts", statusTone: "ok" }),
      baseStep({ key: "twin", title: "Twin", done: false, statusReason: "Awaiting admin review", statusTone: "warn" }),
      baseStep({ key: "v2", title: "V2", done: false, statusReason: "ID no longer resolves", statusTone: "error" }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);

    expect(screen.getByTestId("checklist-step-venice").getAttribute("data-status")).toBe("ok");
    expect(screen.getByText("Verified — Alan Watts")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-step-twin").getAttribute("data-status")).toBe("warn");
    expect(screen.getByText("Awaiting admin review")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-step-v2").getAttribute("data-status")).toBe("error");
  });

  it("shows a 'Verifying…' skeleton and hides the Start link while a step is loading", async () => {
    const steps: ChecklistStep[] = [
      baseStep({ key: "venice", title: "Venice", done: false, loading: true, statusReason: "Verified", statusTone: "ok" }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);

    expect(screen.getByTestId("checklist-step-venice-verifying")).toBeInTheDocument();
    // The Verifying skeleton replaces the status line while checking.
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checklist-step-venice-start")).not.toBeInTheDocument();
  });

  it("renders a Retry button on Venice error/warn states and fires onRetry without navigating away", async () => {
    const onRetry = vi.fn();
    const steps: ChecklistStep[] = [
      baseStep({
        key: "venice", title: "Venice", done: false,
        statusReason: "Venice unreachable", statusTone: "warn",
        onRetry, retryLabel: "Re-check Venice",
      }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);

    const retry = screen.getByTestId("checklist-step-venice-retry");
    expect(retry).toHaveTextContent("Re-check Venice");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does NOT render a Retry button on 'ok' or 'info' states (nothing to retry)", async () => {
    const onRetry = vi.fn();
    const steps: ChecklistStep[] = [
      baseStep({ key: "a", title: "A", done: false, statusReason: "In progress", statusTone: "info", onRetry }),
      baseStep({ key: "b", title: "B", done: true, statusReason: "Done", statusTone: "ok", onRetry }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);
    expect(screen.queryByTestId("checklist-step-a-retry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checklist-step-b-retry")).not.toBeInTheDocument();
  });

  it("start link deep-links to the correct route path AND preserves ?step=N search params", async () => {
    const steps: ChecklistStep[] = [
      baseStep({
        key: "venice", title: "Venice", done: false,
        to: "/studio/twin-onboarding", toSearch: { step: 2 },
      }),
    ];
    await renderWithRouter(<SetupChecklist steps={steps} />);

    const link = screen.getByTestId("checklist-step-venice-start") as HTMLAnchorElement;
    // TanStack Router serialises search into the href; both parts must be present
    // so refresh / back-forward land back at the same wizard step.
    expect(link.getAttribute("href")).toContain("/studio/twin-onboarding");
    expect(link.getAttribute("href")).toMatch(/step=2/);
  });
});