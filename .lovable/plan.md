# MVP 1 — Content Pack Ingestion

Creators upload images / video / audio into **named packs**. No AI generation — this is pure ingest, organise, approve.

## Concept

A **Pack** is a named bundle of assets a creator curates (e.g. "Naughty Pack", "Christmas 2026"). Packs are independent of personas but can be attached to one or more personas later (a pack attached to Nice AI becomes that persona's library).

Seeded pack types: `nice`, `naughty`, `wicked`, `seasonal`, `custom`. Creators can create unlimited packs of any type.

## Schema (one migration)

**`content_packs`**
- `id`, `creator_id → creators`, `name` (1–80), `slug` (lowercase, unique per creator)
- `pack_type` enum: `nice | naughty | wicked | seasonal | custom`
- `description`, `cover_asset_id` (nullable → content_assets)
- `status` enum: `draft | in_review | approved | archived` (default `draft`)
- `starts_at`, `ends_at` (nullable — for seasonal packs)
- `sort_order`, `created_at`, `updated_at`
- Unique: `(creator_id, slug)`

**`content_pack_items`** — assets in a pack
- `pack_id`, `asset_id`, `position`, `added_at`
- PK `(pack_id, asset_id)`

**`content_pack_personas`** — attach a pack to persona(s)
- `pack_id`, `persona_id`, `permission_type` (`included | ppv | restricted`), `attached_at`
- PK `(pack_id, persona_id)`
- On attach: fan-out into existing `persona_content_permissions` for each asset (kept in sync via trigger or server fn).

RLS: creator-scoped via `can_manage_creator(creator_id)`; admins full read. GRANTs to `authenticated` + `service_role`. `updated_at` trigger. All mutations log to `audit_logs`.

Seeded on new creator (extend `seed_default_personas` trigger or add sibling): 3 empty packs — Nice Pack, Naughty Pack, Wicked Pack — mirroring the seeded personas.

## Server functions (`src/lib/content-packs.functions.ts`)

- `listPacks()` — packs + counts + attached personas
- `createPack({ name, packType, description?, startsAt?, endsAt? })`
- `updatePack(id, patch)` incl. cover asset, dates, status
- `deletePack(id)` (soft → archived if it has items)
- `bulkUploadToPack({ packId, files[] })` — reuses existing `bulkCreateAssets`, then inserts pack_items in one go
- `addAssetsToPack(packId, assetIds[])` / `removeAssetsFromPack(packId, assetIds[])`
- `reorderPackItems(packId, orderedAssetIds[])`
- `attachPackToPersona(packId, personaId, permissionType)` / `detachPackFromPersona(...)` — fan-out to `persona_content_permissions`
- `submitPackForReview(packId)` → `in_review` (uses existing rate limiter)
- Admin: `adminListPendingPacks()`, `adminSetPackApproval(packId, 'approved' | 'rejected', note?)` — reuses admin.functions pattern

## UI

**`/studio/packs`** — new hub route
- Grid of pack cards with cover, type badge, item count, status pill, attached-personas chips
- "New pack" dialog (name, type, optional season dates)
- Filters: type, status
- Tile added to `/studio` dashboard ("Content packs")

**`/studio/packs/$packId`** — pack detail
- Header: name, type, status, submit-for-review button, attach-to-persona multi-select
- **Bulk upload dropzone** (reuses `BulkUploadDialog` flow but scoped to this pack)
- Grid of assets in the pack with drag-to-reorder, remove-from-pack, "set as cover"
- "Add from vault" dialog — picks existing `content_assets` to add
- Audit tab (reuses `AuditDialog` pattern scoped to pack)

**`/studio/content`** — existing vault gets a "Packs" column showing which packs an asset belongs to.

**Admin `/admin`** — new "Packs" tab: pending packs list with Approve / Reject + note (mirrors synthetic assets tab).

## Approval flow

`draft` → creator clicks Submit → `in_review` → admin approves → `approved` (visible to attached personas' fans) or `rejected` (creator revises). Status independent of individual asset approval; a pack surfaces the strictest of its items + its own status.

## Out of scope (later MVPs)

- AI generation into packs
- Fan-facing pack browsing UI (this MVP is creator-side ingest only; existing persona content permissions already gate fan access)
- Pricing per pack (assets keep their own `price_cents`)
- Pack templates / cloning

## Deliverables checklist

1. Migration: `content_packs`, `content_pack_items`, `content_pack_personas` + enums + RLS + GRANTs + trigger for seeding 3 default packs on new creator.
2. `src/lib/content-packs.functions.ts` with the fns above.
3. `src/routes/studio.packs.tsx` (hub) + `src/routes/studio.packs.$packId.tsx` (detail).
4. Update `src/routes/studio.index.tsx` — add "Content packs" tile.
5. Update `src/routes/studio.content.tsx` — show pack chips per asset.
6. Update `src/routes/admin.tsx` — add "Packs" moderation tab.
7. Extend `src/lib/admin.functions.ts` with pack approval fns.
