import { describe, expect, it } from "vitest";
import { nextFeedTierForToggle } from "../feed-visibility-tier-toggle";

describe("nextFeedTierForToggle (pure)", () => {
  it("turning ON logged-out visibility always resolves to public, regardless of starting tier", () => {
    expect(nextFeedTierForToggle("subscribers_only", "loggedOut", true)).toBe("public");
    expect(nextFeedTierForToggle("logged_in", "loggedOut", true)).toBe("public");
    expect(nextFeedTierForToggle("public", "loggedOut", true)).toBe("public");
  });

  it("turning OFF logged-out visibility falls back to logged_in, never to the impossible combination", () => {
    expect(nextFeedTierForToggle("public", "loggedOut", false)).toBe("logged_in");
  });

  it("turning OFF logged-out visibility from a state with no logged-in visibility stays at subscribers_only", () => {
    expect(nextFeedTierForToggle("subscribers_only", "loggedOut", false)).toBe("subscribers_only");
  });

  it("turning ON logged-in visibility resolves to public if logged-out was already visible, else logged_in", () => {
    expect(nextFeedTierForToggle("public", "loggedIn", true)).toBe("public");
    expect(nextFeedTierForToggle("subscribers_only", "loggedIn", true)).toBe("logged_in");
  });

  it("turning OFF logged-in visibility always resolves to subscribers_only, also forcing logged-out off", () => {
    expect(nextFeedTierForToggle("public", "loggedIn", false)).toBe("subscribers_only");
    expect(nextFeedTierForToggle("logged_in", "loggedIn", false)).toBe("subscribers_only");
  });

  it("never produces the impossible combination (logged-out visible but logged-in not) for any input", () => {
    const tiers = ["public", "logged_in", "subscribers_only"] as const;
    const whichs = ["loggedOut", "loggedIn"] as const;
    for (const tier of tiers) {
      for (const which of whichs) {
        for (const value of [true, false]) {
          const next = nextFeedTierForToggle(tier, which, value);
          const loggedOutVisible = next === "public";
          const loggedInVisible = next === "public" || next === "logged_in";
          expect(loggedOutVisible && !loggedInVisible).toBe(false);
        }
      }
    }
  });
});
