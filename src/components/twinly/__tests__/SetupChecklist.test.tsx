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

  // ---------------------------------------------------------------------------
  // Supporter dashboard: the "Verify your identity (optional)" checklist step.
  // The identity step must communicate three distinct verification states
  // (verified / pending / not started) with the correct tone, and show a
  // "Verifying…" skeleton while the server-side status is still loading.
  // ---------------------------------------------------------------------------
  describe("Supporter identity step", () => {
    it("renders 'Verifying…' skeleton while the ID verification status is loading", async () => {
      const steps: ChecklistStep[] = [
        baseStep({
          key: "identity",
          title: "Verify your identity (optional)",
          to: "/account",
          optional: true,
          done: false,
          loading: true,
          // Even with a statusReason set, loading must win — otherwise the UI
          // shows a stale "Not verified" while the check is still in flight.
          statusReason: "Not required to use Twinly.",
          statusTone: "info",
        }),
      ];
      await renderWithRouter(<SetupChecklist steps={steps} />);
      expect(screen.getByTestId("checklist-step-identity-verifying")).toBeInTheDocument();
      expect(screen.queryByText("Not required to use Twinly.")).not.toBeInTheDocument();
      // Start link must be hidden until validation resolves — clicking it during
      // loading could send the user off to /account before we know the answer.
      expect(screen.queryByTestId("checklist-step-identity-start")).not.toBeInTheDocument();
    });

    it("shows 'ok' tone with the verified message once id_verified_at is set", async () => {
      const steps: ChecklistStep[] = [
        baseStep({
          key: "identity",
          title: "Verify your identity (optional)",
          to: "/account",
          optional: true,
          done: true,
          loading: false,
          statusReason: "Verified — you can join every creator, including verified-only ones.",
          statusTone: "ok",
        }),
        // A second incomplete step keeps the checklist expanded — otherwise
        // a solo-complete list auto-collapses to the "setup complete"
        // banner and the per-step markup we're asserting on isn't rendered.
        baseStep({ key: "follow", title: "Follow a creator", done: false }),
      ];
      await renderWithRouter(<SetupChecklist steps={steps} />);
      const step = screen.getByTestId("checklist-step-identity");
      expect(step.getAttribute("data-status")).toBe("ok");
      expect(step.getAttribute("data-done")).toBe("true");
      expect(screen.getByText(/Verified — you can join every creator/)).toBeInTheDocument();
    });

    it("shows 'warn' tone while a Stripe session is pending review", async () => {
      const steps: ChecklistStep[] = [
        baseStep({
          key: "identity",
          title: "Verify your identity (optional)",
          to: "/account",
          optional: true,
          done: false,
          loading: false,
          statusReason: "Pending — Stripe is reviewing your submission.",
          statusTone: "warn",
        }),
      ];
      await renderWithRouter(<SetupChecklist steps={steps} />);
      const step = screen.getByTestId("checklist-step-identity");
      expect(step.getAttribute("data-status")).toBe("warn");
      expect(step.getAttribute("data-done")).toBe("false");
      expect(screen.getByText(/Pending — Stripe is reviewing/)).toBeInTheDocument();
    });

    it("shows 'info' tone with the 'not required' explainer when the fan hasn't started verification", async () => {
      const steps: ChecklistStep[] = [
        baseStep({
          key: "identity",
          title: "Verify your identity (optional)",
          to: "/account",
          optional: true,
          done: false,
          loading: false,
          statusReason:
            "Not required to use Twinly. Some creators do restrict their persona to verified supporters — verifying once here unlocks all of them.",
          statusTone: "info",
        }),
      ];
      await renderWithRouter(<SetupChecklist steps={steps} />);
      const step = screen.getByTestId("checklist-step-identity");
      expect(step.getAttribute("data-status")).toBe("info");
      // "Optional" chip must render so the fan understands ID is not mandatory
      // — this is our platform-wide guarantee, distinct from any single
      // creator's per-persona verified-only restriction.
      expect(within(step).getByText("Optional")).toBeInTheDocument();
      expect(screen.getByText(/Not required to use Twinly/)).toBeInTheDocument();
      // No retry action on the neutral info state — nothing has failed.
      expect(screen.queryByTestId("checklist-step-identity-retry")).not.toBeInTheDocument();
    });
  });
});