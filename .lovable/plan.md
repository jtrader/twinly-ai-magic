
## Goal

Add three capabilities to the persona chat surface:

1. **Fans can send voice messages** to any persona (Real Me + AI).
2. **Creators/personas can reply with voice** — creators record voice notes into the Real Me inbox; AI personas can optionally generate a TTS voice reply.
3. **Creators can save messages per persona** — canned replies that can be inserted into the composer (Real Me) or seeded as few-shot examples for the AI persona.

## Database changes (one migration)

- Extend `public.messages`:
  - `attachment_url text` (storage object path)
  - `attachment_kind text check in ('audio','image')` — starts audio-only
  - `attachment_duration_ms integer`
  - `transcript text` (STT result, searchable + shown as caption)
- New table `public.persona_saved_messages`:
  - `creator_id`, `persona_id`, `label text`, `body text`, `kind text check in ('text','voice')`, `attachment_url text`, `sort_order int`, timestamps
  - GRANT to authenticated + service_role; RLS: only `can_manage_creator(creator_id)` can select/insert/update/delete.
- New private storage bucket `voice-messages` (created via `supabase--storage_create_bucket`) with RLS on `storage.objects` scoping read to conversation participants (fan_id or creator owner) and write to the sender's own `{userId}/...` prefix.

## Backend (server functions)

Add to `src/lib/chat.functions.ts`:
- `uploadVoiceMessage` — accepts base64/blob metadata, returns signed upload target (client uploads directly to storage), then persists a `messages` row with `attachment_kind='audio'`, `attachment_url`, `duration_ms`. Runs rate-limit + moderation on `transcript` (once transcribed).
- Extend `sendPersonaMessage` to accept optional `attachmentUrl`/`durationMs`/`transcript` and skip the text-only content guard when a voice attachment is present.
- `transcribeVoice` — server fn that calls Lovable AI Gateway STT (Whisper) with the storage object, writes `transcript` back to the message row.
- For AI personas: if the persona has `voice_enabled` (existing `creator_voice_profiles` row), synthesise TTS for the assistant reply via Lovable AI Gateway TTS, upload to `voice-messages`, and store as an assistant message with `attachment_kind='audio'`.
- `getSignedVoiceUrl` — mints a short-lived signed URL for playback, gated by conversation participation.

New file `src/lib/saved-messages.functions.ts`:
- `listSavedMessages({ personaId })`, `createSavedMessage`, `updateSavedMessage`, `deleteSavedMessage`, `reorderSavedMessages`. All wrapped in `requireSupabaseAuth` + `can_manage_creator` check.

## Frontend

`src/routes/chat.$handle.$persona.tsx` (fan chat):
- Add a mic button to the composer using `MediaRecorder` (webm/opus). Show recording timer + waveform placeholder + cancel/send controls.
- On send: upload blob to `voice-messages/{userId}/{uuid}.webm`, then call `sendPersonaMessage` with attachment metadata. Optimistically render a voice bubble with an inline `<audio>` player.
- Render incoming messages with `attachment_kind='audio'` as a play/pause pill + duration + (transcript caption once available).

`src/routes/studio.inbox.tsx` (creator Real Me inbox):
- Add mic button to reply composer with the same recorder flow — creates a message with `sender_type='creator'` and voice attachment.
- Add a "Saved replies" popover: lists persona's `persona_saved_messages`, click to insert text into composer or send voice directly.

`src/routes/studio.personas.tsx` (persona editor):
- New **Saved messages** tab per persona: CRUD list with label, body, optional voice recording; drag-reorder. Toggle "Use as AI few-shot examples" (adds to system prompt context) for AI personas.

Small `VoiceRecorder` component in `src/components/twinly/` reused across fan chat + inbox + saved-messages editor. Small `VoicePlayer` component for bubbles.

## Security & UX guardrails

- Voice bucket is private; playback always via signed URLs bounded to conversation participants.
- Max recording length: 60s (client-enforced + rejected server-side if `duration_ms > 60000`).
- Same rate limiter as text chat (`chat` bucket).
- Voice attachments run STT first, then the transcript flows through `screen_message` for moderation — blocked severity rejects the message and deletes the storage object.
- Age-gate (`assertAdult`) still enforced.

## Assumptions

- Lovable AI Gateway provides STT + TTS endpoints; if the current gateway helper lacks them, add small wrappers in `src/lib/venice.server.ts` sibling file `src/lib/voice.server.ts` (server-only).
- AI voice replies are opt-in per persona (existing `creator_voice_profiles` row acts as the flag); no new consent surface needed beyond the existing Digital Twin consent.
- Only audio for now — no video messages, no image attachments (schema leaves room for later).

## Out of scope

- Real-time voice calls
- Per-message tipping/PPV on voice notes (existing subscription/tier gate still applies at the persona level)
