## Goal
Give creators real playback + reload + download controls for AI-generated images and voice notes directly on `/studio/generate`, without navigating to the vault.

## Image tab (`ImageTab`)
Under the streaming `<img>` preview, add a compact toolbar (visible once a frame exists):
- **Re-stream** — cancels any in-flight request via the existing `abortRef` and re-runs `runGenerate(lastAttempt.current.prompt)`. Disabled while `busy` or when no last attempt exists.
- **Reload preview** — cheap client-only refresh: re-assigns `dataUrl` to force `<img>` re-decode (useful if a partial frame looks corrupted mid-stream).
- **Open full size** — opens `dataUrl` in a new tab.
- **Download PNG** — anchor with `download="<slug>-<timestamp>.png"` pointing at `dataUrl`; enabled only when `isFinal && b64`.
- **Copy prompt** — writes the prompt used for this render to clipboard.
- Show frame progress hint ("Preview frame · streaming…" vs "Final frame") next to the toolbar.
- Keep the existing `Save to vault` button in the same row for symmetry.

Cancel affordance while streaming: show a `Stop` button (calls `abortRef.current?.abort()`) beside `Generating…`.

## Voice tab (`VoiceTab`)
Since voice generation is one-shot (not streamed), enhance the existing `<audio>` block:
- Wrap `<audio>` in a `ref` so custom controls can call `.play()/.pause()/.currentTime`.
- Toolbar under the player:
  - **Re-generate** — re-runs `runGenerate(lastAttempt.current)` (same script/voice/title). Shows spinner while `busy`.
  - **Reload player** — re-sets the `<audio src>` (bump a cache-buster query param on `previewUrl`) to force the browser to re-fetch the signed URL, useful if playback stalls.
  - **Restart** — `audio.currentTime = 0; audio.play()`.
  - **Download MP3** — anchor with `download="<title-or-voice-note>-<timestamp>.mp3"` using `previewUrl`.
  - **Open in new tab** — direct link to `previewUrl`.
- Show voice name + duration (from `audio.onloadedmetadata`) as small metadata line.
- Keep the "signed URL, 1h" note but add a subtle "URL may expire — use Reload if playback fails" hint.

## Small shared additions
- Add a `downloadDataUrl(name, url)` helper (creates a temporary `<a download>` and clicks it) to keep both tabs identical.
- Add `slugify(title)` for filenames.
- All new buttons use existing `Button` variants (`outline`, `ghost`, small sizes) and lucide icons already imported where possible (`RefreshCw`, `Download`, `Play`, `ExternalLink`, `Copy`, `Square`). Import missing icons in one line.

## Out of scope
- No changes to server functions, storage, or SSE parser.
- No changes to the Talking-head tab (already has live status/deep link to vault).
- No new persistence — controls act on the in-memory preview only.

## Files touched
- `src/routes/studio.generate.tsx` — only file edited.
