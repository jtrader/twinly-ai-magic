
## Goal

Replace the pending talking-head placeholder with a real HeyGen-rendered MP4. Flow: creator submits script → server generates TTS audio → server submits render job to HeyGen → HeyGen calls our webhook when done → we download the MP4 into `content-assets` storage and update the asset row.

## Secrets to add

- `HEYGEN_API_KEY` — HeyGen v2 API key (creator gets it at app.heygen.com → Space Settings → API).
- `HEYGEN_WEBHOOK_SECRET` — auto-generated shared secret, sent as `X-Webhook-Signature` header we verify with HMAC-SHA256 over the raw body.

Both requested via `add_secret` / `generate_secret` after this plan is approved.

## Schema changes (one migration)

Add provider tracking to `content_assets` so we can correlate webhook callbacks:

```sql
ALTER TABLE public.content_assets
  ADD COLUMN provider text,               -- 'heygen'
  ADD COLUMN provider_job_id text,        -- HeyGen video_id
  ADD COLUMN provider_status text,        -- raw status from provider
  ADD COLUMN provider_error text,
  ADD COLUMN render_started_at timestamptz,
  ADD COLUMN render_completed_at timestamptz;

CREATE INDEX content_assets_provider_job_id_idx
  ON public.content_assets(provider, provider_job_id)
  WHERE provider_job_id IS NOT NULL;
```

No new tables, no policy changes (existing creator-scoped policies still apply; the webhook uses `supabaseAdmin`).

## Persona → avatar/voice mapping

HeyGen needs an `avatar_id` and `voice_id` per render. Reuse existing twin config:

- Add optional `heygen_avatar_id` and `heygen_voice_id` columns to `personas` (nullable text). Surfaced in the persona editor Twin tab under a small "External render IDs" section — creators paste the IDs from their HeyGen account after uploading their likeness there.
- If a persona has no IDs, fall back to workspace defaults `HEYGEN_DEFAULT_AVATAR_ID` / `HEYGEN_DEFAULT_VOICE_ID` env vars; if neither is present, the queue call returns a clear validation error.

(No auto-upload of the twin likeness to HeyGen in this pass — that belongs in a follow-up "auto-provision avatar" task.)

## Server changes

**1. New provider module `src/lib/heygen.server.ts`**
- `submitTalkingHead({ avatarId, voiceId, audioUrl, title })` → POST `https://api.heygen.com/v2/video/generate` with an `audio` input pointing at a short-lived signed URL of the TTS MP3 we just stored. Returns `{ video_id }`.
- `fetchHeygenStatus(videoId)` → GET `https://api.heygen.com/v1/video_status.get` — used only by the polling fallback route below (belt-and-braces; UI still uses webhook path).
- `verifyHeygenSignature(rawBody, header)` → HMAC-SHA256 timing-safe compare.

**2. Rewrite `queueTalkingHead` in `src/lib/ai-generate.functions.ts`**
- Keep validation + creator lookup.
- Enforce twin policy for `video` output via existing `assertTwinPolicy` (same as `publishRequestPlaceholders`).
- Resolve `avatar_id` / `voice_id` (persona override → env default → error).
- Reuse voice-note pipeline: call the existing TTS gateway, upload MP3 to `content-assets` at `{creator}/generated/tts-<ts>.mp3`, create a 1-hour signed URL.
- Insert `content_assets` row with `category='ai_talking_head_rendering'`, `provider='heygen'`, `render_started_at=now()`, and store the TTS `storage_path` on `metadata` so we can clean up later.
- Call HeyGen; on 2xx, update the row with `provider_job_id`; on failure, mark `category='ai_talking_head_queued'` → `approval_status='rejected'` + `provider_error` and audit-log.
- Return `{ asset, status: 'rendering' }`.

**3. New public webhook route `src/routes/api/public/hooks/heygen.ts`**
- `POST` handler reads raw body via `await request.text()`, verifies `X-Webhook-Signature` with `HEYGEN_WEBHOOK_SECRET` (timing-safe). Reject with 401 if invalid.
- Parse JSON. HeyGen sends `event_type` `avatar_video.success` or `avatar_video.fail` with `event_data.video_id` and `event_data.url`.
- Load asset by `provider='heygen'` + `provider_job_id=video_id` using `supabaseAdmin` (imported inside handler).
- On success: `fetch(url)` the MP4, upload to `content-assets` at `{creator}/generated/talking-head-<assetId>.mp4`, then update row → `storage_path`, `category='ai_talking_head_ready'`, `provider_status='completed'`, `render_completed_at=now()`. Leave `approval_status='pending'` — creator still approves before publishing.
- On failure: update row → `approval_status='rejected'`, `provider_status='failed'`, `provider_error=event_data.error`, `category='ai_talking_head_failed'`.
- Return 200 quickly (no work in the response path beyond DB writes; MP4 fetch happens before the write but is capped at 200MB / 60s).
- Also handle `OPTIONS` returning 204 with permissive CORS in case HeyGen preflights.

**4. Polling safety-net route (optional but cheap)**
- Extend `listTalkingHeadJobs` to also read `provider_job_id`, `provider_status`, `provider_error` and expose them on the returned job objects so the UI can show reasons.
- Add `pollHeygenJobs` server function callable by pg_cron (see below) that scans assets with `category='ai_talking_head_rendering'` older than 2 minutes with no update in the last minute and calls `fetchHeygenStatus` — mirrors the same completion / failure branch used by the webhook. Safe to re-run (idempotent on `storage_path IS NULL`).

**5. Cron (Option 3: webhook + polling)**
- Enable `pg_cron` + `pg_net` (already present).
- Insert (via supabase--insert, not migration) a job scheduled every 5 minutes calling `/api/public/hooks/heygen-poll` (a second small route with the shared secret) that iterates through stalled jobs.

## UI changes

`src/routes/studio.generate.tsx` VideoTab:
- Show new fields on each job row when present: `provider_status`, `provider_error`, and a "Rendering on HeyGen…" subtitle with elapsed time while `status='rendering'`.
- No new tab; polling interval logic already switches to live mode when any job is `queued`/`rendering`.

Persona editor Twin tab: add two small text inputs "HeyGen avatar ID" and "HeyGen voice ID", saved via existing persona update path.

## Webhook URL to give HeyGen

`https://twinly.life/api/public/hooks/heygen` — creator (or we, once) registers it in HeyGen dashboard → Webhooks with the `HEYGEN_WEBHOOK_SECRET`. We surface the URL + secret name in a small info card on `/studio/generate` so the creator knows what to paste into HeyGen.

## Guardrails / edge cases

- Webhook is on `/api/public/*` so it bypasses auth; signature verification is mandatory before any DB read.
- MP4 download validates content-type starts with `video/` and size ≤ 200MB; larger → mark failed with `provider_error='oversize'`.
- Duplicate webhook deliveries: dedupe on `provider_job_id` + presence of `storage_path`.
- If TTS or HeyGen submit fails inside `queueTalkingHead`, we clean up the uploaded TTS file to avoid orphan storage.
- Twin policy re-checked on webhook completion (consent could have been revoked mid-render) — on revocation, we discard the MP4 and mark the asset rejected.

## What is intentionally out of scope

- Auto-uploading twin likeness to HeyGen to create an avatar (manual paste of `avatar_id` for now).
- Lip-sync-only or full custom-scene video.
- Fan-visible playback UI beyond what the vault already renders (existing video preview handles MP4 storage paths).

## Verification steps after build

1. `supabase--curl` the webhook with a bad signature → expect 401.
2. `supabase--curl` the webhook with a valid signed synthetic payload → row updates, MP4 stored.
3. Queue a real job end-to-end using a HeyGen test avatar; watch `listTalkingHeadJobs` transition `rendering → completed` in the UI.
4. Revoke `digital_twin_consent.image_ok`/`video_ok` mid-render → webhook rejects the asset.
