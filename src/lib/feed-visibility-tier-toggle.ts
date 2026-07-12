import type { FeedVisibilityTier } from "@/lib/feed-visibility-access.server";

/**
 * A single 3-rank tier presented to creators as two friendlier switches
 * ("visible to logged-out visitors" / "visible to logged-in non-subscribers")
 * isn't two independent booleans — public implies logged-in-visible too, so
 * the fourth combination (logged-out=true, logged-in=false) is impossible.
 * This resolves a toggle of one switch into the nearest valid tier, keeping
 * the other switch's derived state consistent rather than producing that
 * impossible combination. Deliberately NOT in feed-visibility-access.server.ts
 * (a `.server.ts` module) since this needs to run client-side in the persona
 * editor's toggle handlers.
 */
export function nextFeedTierForToggle(
  current: FeedVisibilityTier,
  which: "loggedOut" | "loggedIn",
  value: boolean,
): FeedVisibilityTier {
  const loggedInVisible = current === "public" || current === "logged_in";
  const loggedOutVisible = current === "public";
  if (which === "loggedOut") {
    // Turning ON logged-out visibility also forces logged-in visibility ON.
    return value ? "public" : (loggedInVisible ? "logged_in" : "subscribers_only");
  }
  // Turning OFF logged-in visibility also forces logged-out visibility OFF.
  return value ? (loggedOutVisible ? "public" : "logged_in") : "subscribers_only";
}
