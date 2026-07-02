# Per-item error handling & retry — /studio/generate

Improve failure UX on the three tabs (Images, Voice notes, Talking head) so creators get a specific reason and a one-click retry instead of a toast that disappears.

## Scope

Frontend-only changes in `src/routes/studio.generate.tsx`. No schema, server-function, or gateway changes.

## Shared error model

Introduce a small local helper used by all three tabs:

- `type GenError = { code: string; title: string; detail: string; retryable: boolean }`
- `classifyError(e, kind)` maps common failures → friendly copy:
  - `validation` — client-side rules failed (prompt too short/long, missing persona/pack, unsupported voice, duration out of range)
  - `moderation` — gateway returned `content_policy_violation` / `moderation_blocked` → suggest rephrasing, no retry
  - `rate_limit` — HTTP 429 → "Too many requests, try again in a moment", retryable
  - `credits` — HTTP 402 → "Workspace out of AI credits", not retryable from UI
  - `network` — fetch/abort/offline → retryable
  - `stream_incomplete` — SSE ended without `image_generation.completed` → retryable
  - `server` — 5xx or unknown → retryable
- Inline `<ErrorCard />` component (replaces the current plain red div) with title, detail, a **Retry** button (when `retryable`), and a **Dismiss** button.

## Validation messages (pre-flight)

Replace generic toasts with field-level inline errors under each input, plus focused messages:

- **Image**: prompt < 8 chars → "Prompts need at least 8 characters so the model has something to work with." Prompt > 2000 → truncate hint. Title > 120 → live counter turns rose.
- **Voice**: script < 4 chars → "Add a sentence or two — 4+ characters." Script > 4000 → counter turns rose and Generate disables. Voice not in allowlist → "Pick a voice from the list."
- **Video**: script < 10 chars → "Talking-head scripts need at least 10 characters." Duration outside 5–60 → "Pick a duration between 5 and 60 seconds."

Generate button stays disabled while any field-level error is active; hovering shows the reason via `title`.

## Per-tab wiring

Each tab keeps its last submitted inputs in a `lastAttempt` ref so **Retry** re-runs the exact same call without the user re-typing.

- **ImageTab**: parse HTTP status + SSE `error` frames through `classifyError`. On `stream_incomplete`, keep any partial frame visible but overlay the error card with Retry. Save button hidden while an error is showing.
- **VoiceTab**: wrap `generateVoiceNote` call; on failure show `ErrorCard` above the button. Preserve script/title/voice so Retry is one click.
- **VideoTab**: wrap `queueTalkingHead`; same pattern. Success still clears the form.

## Out of scope

- No changes to server functions, RLS, or the `/api/generate-image` route.
- No new toasts library or global error boundary work.
- No changes to the vault, packs, or persona flows.
