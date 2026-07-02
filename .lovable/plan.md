# Phase 0.5 — Hardening

Sensible defaults applied to the six open questions:

1. **Consent model** — Split: `digital_twin_consent` = current state (one active row per creator), `consent_records` = append-only history of every signature/revocation event.
2. **Agency scope** — Creator-only for digital-twin consent. Agencies can manage personas/content but cannot sign consent on behalf of a creator. New helper `is_creator_owner()` used for consent gates.
3. **Moderator role** — Defer to Phase 3. Keep enum extensible (already `app_role`).
4. **NSFW handling** — Two-layer gate: 18+ age gate (required for all fan surfaces) + explicit-content toggle on fan profile required to view personas flagged `is_explicit`. Add `is_explicit` boolean to `personas`.
5. **Real Me replies** — Path (a) for MVP: creator replies manually from inbox. No AI drafting yet. `sendPersonaMessage` for `real_me` continues to store fan message with no synthetic reply.
6. **Legal copy** — Ship "public beta" placeholders with a visible banner ("Draft — pre-launch") on each legal page. Real copy comes later.

## Scope

Infrastructure and safety plumbing only. No new user-facing product surfaces (those come in Phase 1+). Existing functionality preserved.

## Database changes (single migration)

**Constraints & integrity**
- `UNIQUE` on `creators.handle`, `personas(creator_id, slug)`, `profiles.display_name` left free.
- Case-insensitive handle: enforce via `CHECK (handle = lower(handle))` + citext-free lowercase trigger.
- `NOT NULL` audit on `personas.kind`, `personas.disclosure_label`, `content_assets.is_synthetic`.
- Add `personas.is_explicit BOOLEAN NOT NULL DEFAULT false`.
- Add `profiles.date_of_birth DATE` (nullable) + `profiles.age_verified_at TIMESTAMPTZ` for server-side age gate.
- Add `profiles.explicit_content_opt_in BOOLEAN NOT NULL DEFAULT false`.

**Append-only audit log**
- `audit_logs(id, actor_user_id, action TEXT, subject_type TEXT, subject_id UUID, metadata JSONB, created_at)`.
- RLS: insert via SECURITY DEFINER helper `log_audit(...)`; SELECT restricted to admins.
- Trigger prevents UPDATE/DELETE.

**Consent split**
- Keep `digital_twin_consent` as current-state (add `UNIQUE(creator_id)`).
- Keep `consent_records` as history; add trigger on `digital_twin_consent` insert/update that appends to `consent_records`.
- New helper `is_creator_owner(_creator_id UUID)` — checks `creators.user_id = auth.uid()` only (no agency, no admin escalation for consent).
- Update `digital_twin_consent` RLS to use `is_creator_owner` for INSERT/UPDATE.

**Public profile view**
- `profiles_public` VIEW exposing only `id, display_name, avatar_url` (no email, no dob). `GRANT SELECT` to `anon, authenticated`.
- Public reads (creator profile page) switch to this view where profile joins are needed.

**Age gate server-side**
- New server function `assertAdult()` used by fan-scoped server functions (chat, discover explicit). Reads `profiles.age_verified_at`; returns 403 if null.
- Client `AgeGateDialog` writes DOB → server fn `verifyAge({ dob })` which validates ≥18 and sets `age_verified_at`. Persist localStorage flag as UX cache only.

**Rate limiting scaffold**
- `rate_limits(user_id, bucket, window_start, count, PRIMARY KEY(user_id, bucket, window_start))`.
- Helper `check_rate_limit(_bucket TEXT, _limit INT, _window_seconds INT)` SECURITY DEFINER. No enforcement wired yet beyond `sendPersonaMessage` (30 msgs / 5 min per user).

**Moderation trigger scaffold**
- `moderation_events` gains `severity` enum (`low|medium|high|critical`) and `auto_flagged BOOLEAN`.
- Simple keyword deny-list function `screen_message(text)` returns severity. `sendPersonaMessage` calls it; high/critical blocks reply and inserts `moderation_events`. Keyword list stored as constant in the function (editable later).

## Storage buckets

Create private buckets (no public read):
- `content-assets` — creator vault media.
- `verification-evidence` — ID/selfie/proof for creator verification.
- `consent-signatures` — signed consent PDFs/screenshots.

RLS on `storage.objects`:
- `content-assets`: manager can CRUD own creator's files (path prefix `creator_id/…`).
- `verification-evidence` & `consent-signatures`: creator-owner insert only; SELECT restricted to admins + owner.

## Code changes

**New files**
- `src/lib/audit.server.ts` — thin wrapper calling `log_audit` via admin client.
- `src/lib/age-gate.functions.ts` — `verifyAge`, `assertAdult`.
- `src/lib/rate-limit.server.ts` — `checkRateLimit` helper.
- `src/lib/moderation.server.ts` — `screenMessage` + `recordModerationEvent`.

**Modified files**
- `src/lib/chat.functions.ts` — call `assertAdult`, `checkRateLimit('chat', 30, 300)`, `screenMessage` before AI call; log to `audit_logs`.
- `src/components/twinly/AgeGateDialog.tsx` — collect DOB, call `verifyAge` server fn, then set localStorage.
- `src/routes/legal.terms.tsx`, `legal.privacy.tsx`, `legal.ai-disclosure.tsx` — add visible "Draft — pre-launch" banner (placeholder copy stays).
- `src/routes/creators.$handle.tsx` — swap profile join to `profiles_public`.

**Untouched**
- Landing, auth, discover, chat UI shell, persona architecture, existing SEO, root layout.

## Files summary

Created (~5) · Modified (~5) · One DB migration · Three storage buckets.

## What still comes later (not this phase)

- Persona Studio, Content Vault UI, Consent signing UI, Verification submission UI → Phase 1
- Explicit content opt-in UI, moderation review console → Phase 2/3
- Real legal copy, PWA install prompts, service worker → Phase 6

## Deliverables at end of phase

- Migration applied, buckets created, RLS verified.
- Chat flow enforces age gate + rate limit + keyword moderation server-side.
- Audit log receives events for: age verification, consent state change, moderation flag, chat message send.
- Type-check passes; no UI regressions on existing routes.
