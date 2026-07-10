# Supporter-flagged AI conversations → Creator review + handoff

## Context

The app already has three adjacent pieces, none of which cover this flow:

- `ReportDialog` / `moderation.functions` — safety reports to the platform team.
- `RequestRealMeButton` / `escalation_requests` — supporter *pays/asks* to move to Real Me.
- `flagAiMessage` (creator-side) — creator QA-flags an AI message from `studio/ai-review`.

Missing: a lightweight way for a supporter to say "this AI reply was off — please have the real creator look at this thread," which lands in the creator's queue and can be resolved by (a) acknowledging, (b) editing/retraining the reply, or (c) opening a Real Me handoff.

## What to build

### 1. Data model (one migration)

New table `public.conversation_flags`:

- `id`, `created_at`, `resolved_at`
- `conversation_id` → conversations, `message_id` → messages (nullable — flag whole thread or a specific AI message)
- `creator_id`, `persona_id` (denormalized for queue filtering)
- `flagged_by` (supporter user id)
- `reason` enum: `off_tone`, `inaccurate`, `uncomfortable`, `wants_human`, `other`
- `note` text (≤500 chars)
- `status` enum: `open`, `acknowledged`, `handed_off`, `dismissed`
- `resolution_note` text, `resolved_by` uuid, `handoff_request_id` uuid (nullable link to `escalation_requests` when creator converts to Real Me)

RLS + GRANTs:
- Supporter INSERT for own `flagged_by = auth.uid()` (rate-limited via `check_rate_limit`).
- Supporter SELECT own flags.
- Creator SELECT/UPDATE flags where they own the `creator_id` (reuse `can_manage_creator`).
- Admin full access.

### 2. Server functions (`src/lib/conversation-flags.functions.ts`)

- `flagConversation({ conversationId, messageId?, reason, note? })` — supporter side; validates ownership of conversation (fan_id = auth.uid()), rate-limits, inserts flag, notifies creator via `createNotification` (`type: "conversation_flagged"`, link `/studio/flags`).
- `listCreatorFlags()` — creator queue (open first, then history); joins supporter profile, persona, last message body preview.
- `loadFlagThread({ flagId })` — full conversation thread + flag context for review pane.
- `resolveFlag({ flagId, action: "acknowledge" | "dismiss", note? })` — updates status, notifies supporter.
- `handoffFlagToRealMe({ flagId, message? })` — creates an `escalation_requests` row auto-accepted by the creator (creates/ensures the Real Me conversation just like `respondToEscalation` accept path), links it back on the flag, notifies supporter with the Real Me chat link.

All writes go through `logAudit`.

### 3. Supporter UI

- New `FlagConversationButton` (icon + dialog) added to the chat header in `src/routes/chat.$handle.$persona.tsx`, visible only on AI personas. Dialog: reason radios + optional note + "Flag this reply" checkbox that captures the last AI `messageId` from thread state.
- Small inline "Flag" affordance on each AI message bubble (hover/tap) that pre-fills the messageId.
- Post-submit toast with link to a new `/fan` tab "My flags" listing status.

### 4. Creator UI (`src/routes/studio.flags.tsx`)

- Same shell/style as `studio.escalations.tsx` and `studio.ai-review.tsx`.
- Left: list of open + history flags (badge counts, reason, supporter, persona, time).
- Right: selected flag detail — thread preview around the flagged message, reason/note, action buttons: **Acknowledge**, **Open handoff** (uses `handoffFlagToRealMe`), **Dismiss**, and a shortcut into `studio/ai-review` for the same conversation to save a corrected reply as a few-shot example.
- Add a nav entry in `studio.index.tsx` and a badge count on the studio dashboard for open flags.

### 5. Notifications & wiring

- Reuse `createNotification` for both sides (creator on new flag; supporter on resolve/handoff).
- Header bell already renders these — no changes there.

## Out of scope

- No new payment flow: handoff reuses the existing `escalation_requests` path and its pricing.
- No changes to safety reports or the existing creator-side `flagAiMessage` QA flow.
- No background jobs; stale-open flags remain visible until the creator resolves them (matches existing pattern).

## Files

- add: `supabase/migrations/<ts>_conversation_flags.sql`
- add: `src/lib/conversation-flags.functions.ts`
- add: `src/components/twinly/FlagConversationButton.tsx`
- add: `src/routes/studio.flags.tsx`
- add: `src/routes/fan.flags.tsx` (supporter's own flags list)
- edit: `src/routes/chat.$handle.$persona.tsx` (button + per-message flag)
- edit: `src/routes/studio.index.tsx` (nav card + open-count)
- edit: `src/lib/notifications.functions.ts` only if a new notification `type` needs whitelisting
