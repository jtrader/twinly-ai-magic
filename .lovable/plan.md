# Talking-head queue status + live polling

Give the Talking head tab a live status panel that shows queued clips with pending/completed states and refreshes automatically until each is resolved.

## Server

Add a small read-only server function `listTalkingHeadJobs` in `src/lib/ai-generate.functions.ts`:

- `.middleware([requireSupabaseAuth])`, `GET`.
- Resolves current creator via `requireCreator`.
- Selects the last 20 talking-head placeholder assets: `content_assets` filtered by `creator_id`, `asset_type = 'video'`, `is_synthetic = true`, `category ILIKE 'ai_talking_head%'`, ordered by `created_at desc`.
- Returns DTOs: `{ id, title, created_at, approval_status, category, storage_path }`.
- Derives a UI status from the row:
  - `category = 'ai_talking_head_queued'` and no `storage_path` → `"queued"`
  - `category = 'ai_talking_head_rendering'` → `"rendering"`
  - `storage_path` present and `approval_status = 'pending'` → `"completed"` (render finished, awaiting creator approval)
  - `approval_status = 'approved'` → `"approved"`
  - `approval_status = 'rejected'` or `'blocked'` → `"failed"`
  - else fall back to `"queued"`.

Also update `queueTalkingHead` to return the new DTO shape for the row it just created so the client can prepend it optimistically.

No new tables, no schema changes — the existing `content_assets.category` + `approval_status` + `storage_path` fields carry the state until a real renderer is wired in.

## Client — `VideoTab` in `src/routes/studio.generate.tsx`

- Wire `listTalkingHeadJobs` via `useServerFn` and TanStack Query with `queryKey: ["talking-head-jobs"]`, `refetchInterval` computed from data:
  - 4000ms when any job is `queued` or `rendering`
  - `false` (stop polling) when every job is a terminal state (`completed`, `approved`, `failed`)
- On successful `queueTalkingHead`, call `queryClient.invalidateQueries` for the same key and reset polling.
- Render a **Recent renders** panel below the form, showing up to 10 rows. Each row has:
  - Title + relative time (`Intl.RelativeTimeFormat`)
  - `<StatusPill>` with icon + color:
    - queued → amber, `Clock` icon, "Queued"
    - rendering → brand, spinning `Loader2`, "Rendering…"
    - completed → emerald, `CheckCircle2`, "Ready for review"
    - approved → emerald outline, `ShieldCheck`, "Approved"
    - failed → rose, `AlertTriangle`, "Failed"
  - Small link "Open in vault" → `/studio/content` for completed/approved rows.
- Header shows a live indicator: green pulse + "Live" when polling is active; muted "Idle" when no active jobs.
- Empty state: "No talking-head jobs yet. Queue a clip above to see it here."
- Preserve the existing amber "Preview integration" notice above the form.

## Copy + a11y

- Status pills carry `aria-label` matching visible text.
- Polling countdown is not shown (avoids noisy UI); just the "Live" pulse.
- All timestamps use `<time dateTime={iso}>` for accessibility.

## Out of scope

- No provider integration, no webhook, no simulated render clock.
- No changes to Images/Voice tabs, vault, or approval flow.
- No schema migration.
