## Goal
Make the "Generate random profile" button visible in the Real Me baseline top-right header on `/studio/real-me`.

## Diagnosis steps (once in build mode)
1. Load `/studio/real-me` via Playwright headless, capture a screenshot of the header area, and dump any runtime errors from the console.
2. Confirm which of these is the actual cause:
   - a) Page is erroring before the header renders (e.g. import from `real-me-generate.functions` failing, `getRealMeProfile` throwing → stuck on "Loading…" or blank).
   - b) Button renders but is off-screen because the header's `flex items-center gap-3` row is overflowing at ~1105px viewport (title `flex-1` + two buttons + long labels).
   - c) Button is present but visually indistinguishable (same tone as Version history) so the user didn't notice it.
   - d) User is on the published deployment (not the preview) and the latest build hasn't shipped yet.

## Fix (applied based on root cause)
- If (a) — fix the underlying error (missing export, server-fn 500) so the header actually mounts, and add a visible error state instead of the silent `return null` when `versionId` is missing.
- If (b) — make the header responsive: wrap the two action buttons in a `flex-wrap` / `ml-auto` group, shorten labels on small screens ("Generate" / "History" with icons), and ensure they stay pinned to the right without pushing off-screen.
- If (c) — give the Generate button a distinct accent (brand gradient / Sparkles icon prominent) and add a subtle "New" badge so it's obviously the AI action.
- If (d) — tell the user it's on preview only until they republish; offer the Publish action.

## Verification
- Playwright screenshot of `/studio/real-me` at 1105×719 and 1440×900 showing the Generate button in the header.
- Click it and confirm the generation dialog opens.

## Technical notes
- Header lives in `src/routes/studio.real-me.tsx` around lines 210–226.
- Button is gated by `disabled={!!draft}` — that's expected (hidden actions while reviewing a draft), not a bug.
- Whole page returns `null` if `!versionId`; replace with a visible fallback so future load failures aren't silent.
