# MVP 2 — Digital Twin Profile Builder

Add a single hub page where creators configure everything an AI twin needs: reference material, consent, and use rules. Reuses existing `digital_twin_consent`, `creator_voice_profiles`, and `content-assets` storage.

## Route

- `/studio/twin` — new page in the `_authenticated` layout, linked from Creator Studio dashboard and Persona Studio.

## Sections (single scrollable page with sticky section nav)

1. **Identity references** — upload face/body/full-length photos (min 5 recommended). Backed by `content-assets` storage with `asset_kind='identity_ref'` tag; new `twin_reference_assets` table joins them to the creator with slot labels (face, profile, body, expression).
2. **Voice references** — upload 30–120s clean audio clips + optional script transcript. Same table, `kind='voice_ref'`. Surfaces existing `creator_voice_profiles.tone_summary`, banned/approved phrases inline.
3. **Style references** — mood-board image uploads + text descriptors (lighting, wardrobe, setting, palette). Stored as `kind='style_ref'` + `style_notes` JSONB on `creators`.
4. **Consent status** — reads `digital_twin_consent`: signed date, revoked state, likeness/voice/image/video toggles. "Update consent" opens existing consent flow; "Revoke" action stamps `revoked_at` and cascades `creators.digital_twin_status='revoked'`.
5. **Allowed uses** — checkbox matrix written to `digital_twin_consent.allowed_uses` JSONB: AI images, AI video, AI voice replies, AI chat persona, sellable synthetic assets, manager-generated content, survives-termination.
6. **Forbidden uses** — free-form list + preset toggles (no minors themes, no real-person impersonation, no political, no medical claims, custom). Stored as `forbidden_uses` JSONB on `digital_twin_consent`.

## Data changes (one migration)

- New table `public.twin_reference_assets` (creator_id, kind enum `identity_ref|voice_ref|style_ref`, storage_path, slot_label, notes, sort_order). RLS: `can_manage_creator(creator_id)`. GRANTs for authenticated + service_role.
- `ALTER TABLE digital_twin_consent ADD COLUMN forbidden_uses jsonb DEFAULT '{}'`.
- `ALTER TABLE creators ADD COLUMN style_notes jsonb DEFAULT '{}'`.
- Audit trigger writes `log_audit('twin.*', ...)` on inserts/updates.

## Server functions (`src/lib/twin.functions.ts`)

- `getTwinProfile()` — aggregates creator, consent, voice profile, and reference assets.
- `upsertTwinConsent({ allowed_uses, forbidden_uses, toggles })`.
- `upsertStyleNotes({ notes })`.
- `addTwinReference({ kind, path, slot_label })` / `removeTwinReference({ id })`.

All use `requireSupabaseAuth` + `can_manage_creator` check.

## UI components

- `TwinProfilePage` with left rail section nav + status pill (Draft / Ready / Revoked).
- `ReferenceUploader` reusing the pack bulk-upload worker (accepts image or audio filters per section).
- `ConsentPanel` + `UsesMatrix` + `ForbiddenUsesEditor` shadcn forms with zod validation.
- Read-only "AI disclosure preview" card at bottom showing the label fans will see, satisfying EU AI Act Art. 50.

## Out of scope (later MVPs)

- Actual synthetic generation, avatar rendering, voice cloning API wiring — this page only captures inputs and gates future generation on `digital_twin_consent` flags.
