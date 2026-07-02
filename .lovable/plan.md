## Goal

Two related guarantees:

1. When a creator toggles a pack on a persona in the Persona editor and picks Included / Pay-per-view / Restricted, the choice is durably saved to the database and reloaded consistently.
2. Generation requests can only target packs that are (a) attached to the chosen persona, (b) approved, and (c) contain no forbidden assets. Enforced server-side so the client cannot bypass it.

## Current state

- `content_pack_personas (pack_id, persona_id, permission_type, attached_at)` already stores links, and `attachPackToPersona` / `detachPackFromPersona` already upsert/delete rows and fan out per-asset permissions to `persona_content_permissions`.
- Persona editor "Packs" tab loads existing attachments but only via `listPacks` (all packs) — it does not hydrate the attachment/permission rows for the current persona on open, so the UI can drift from the DB (toggle state resets after refresh).
- `createGenerationRequest` / `updateRequestStatus` / `publishRequestPlaceholders` verify pack ownership + twin consent but do NOT verify:
  - the pack is attached to the chosen persona,
  - the pack status is `approved`,
  - the pack contains no rejected / restricted / do-not-use assets.
- `publishRequestPlaceholders` hardcodes `permission_type: 'included'` when linking produced synthetic assets to the persona instead of inheriting the pack-persona permission.

## Changes

### 1. Persistence & hydration (Persona editor)

- `src/lib/content-packs.functions.ts`: add `listPersonaPackAttachments({ personaId })` returning `[{ pack_id, permission_type, attached_at }]` for the persona (scoped by creator ownership).
- `src/routes/studio.personas.tsx` Packs tab:
  - On tab open / persona change, call the new fn and seed `attachRows` from DB (currently only mutated locally).
  - Keep existing `togglePack` / `changePermission` — they already round-trip through `attachPackToPersona` / `detachPackFromPersona`.
  - Show pack status pill (draft / in_review / approved / rejected) and disable attach for non-approved packs with an inline explainer.

### 2. Backend enforcement (Generation)

- `src/lib/generate-requests.functions.ts`: extend `assertTwinPolicy` with an optional `{ requirePackAttached: true }` mode used at submit/approve/publish:
  - If a `packId` is provided, require `content_packs.status = 'approved'`.
  - Require a row in `content_pack_personas` for `(packId, personaId)`.
  - Reject when the pack-persona `permission_type = 'restricted'` (restricted = locked preview, not a valid source for synthetic generation).
  - Scan `content_pack_items` → `content_assets` for the pack and reject if any item has `approval_status = 'rejected'`, `moderation_status IN ('flagged','blocked')`, or `internal_label IN ('restricted','do_not_use')`. Return the offending asset ids in the error for surfacing.
- `publishRequestPlaceholders`: after re-running the extended policy check, read the pack-persona `permission_type` and use it when writing `persona_content_permissions` rows (instead of hardcoded `included`), so newly-produced synthetic assets inherit the same access level as the source pack.
- Draft creation stays lenient (ownership only) so creators can save a work-in-progress; the strict checks fire on submit / approve / publish.

### 3. UX surface for enforcement

- `src/routes/studio.create.tsx`: when the persona/pack combo would fail policy, show the specific reason returned by the server (not attached / pack not approved / restricted / N forbidden assets) inline on the request form and in the Review queue action buttons. No new fetches; use the thrown error message.

## Technical details

- No schema migration required — `content_pack_personas` already carries `permission_type` (text; values: `included`, `ppv`, `restricted`).
- Forbidden-asset scan is a single joined read: `content_pack_items` join `content_assets` filtered by `pack_id`, projecting `id, approval_status, moderation_status, internal_label`.
- All new checks live in server functions with `requireSupabaseAuth`; RLS already scopes `content_pack_personas` and `content_pack_items` to the owning creator, so the fn cannot leak cross-creator data even if a bad id is passed.
- Publish-time permission inheritance: single lookup on `content_pack_personas` for `(pack_id, persona_id)`; falls back to `included` only when there is somehow no row (should not happen after the pre-check).
- No changes to `personas`, `content_packs`, or `content_assets` schema. Existing indexes on `(pack_id, persona_id)` and `(pack_id, asset_id)` cover the new reads.
