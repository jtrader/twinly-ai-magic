# Twinly Create — Audit Report

## Verdict per requirement

| # | Requirement | Status |
|---|---|---|
| 1 | Dynamic personas (4 seeded defaults) | ✅ Works — but seeded as `draft`, no publish nudge |
| 2 | Custom personas + attach to packs | ✅ Works — no pack-type ↔ persona-kind guard |
| 3 | Packs assigned to 1+ personas (M:N) | ✅ Fully implemented |
| 4 | Real vs synthetic clearly separated | ⚠️ Schema ✅, UI ✅, but `saveGeneratedImage` / `generateVoiceNote` / `queueTalkingHead` inserts **omit** `source_type`, `internal_label`, `ai_disclosure_required` → assets land labelled `real_upload` |
| 5 | Synthetic can't publish without approval | ✅ Queue path enforced; ⚠️ direct-generate path bypasses twin/policy checks |
| 6 | Digital Twin Profile per creator | ✅ Fully implemented |
| 7 | Consent gates generation | 🔴 Queue path ✅; `saveGeneratedImage` + `generateVoiceNote` do **not** call `assertTwinPolicy` |
| 8 | Revoked consent blocks new work | 🔴 Same bypass as REQ 7 for image/voice |
| 9 | Restricted / Do Not Use hidden from fans | ✅ `fan-feed.functions.ts` filters correctly |
| 10 | Creators only see own data | ✅ RLS + `requireCreator`; ⚠️ `getTwinRefSignedUrl` accepts arbitrary path |
| 11 | Admins manage all | ✅ Implemented |
| 12 | Fans can't reach `/studio/*` | ⚠️ Client-side redirect only, no `beforeLoad` role gate |
| 13 | Assets tie to creator/persona/pack/status | ✅ via queue; ⚠️ no `generation_request_id` FK on `content_assets` |
| 14 | Approved assets publish to persona libraries | ✅ Works; edge case: inherits `restricted` silently |
| 15 | Mobile-first, dark, PWA | ⚠️ Dark/mobile ✅; **no 192/512 PNG icons, no service worker** |

## Critical bugs (block the whole Create flow)

1. **Enum mismatch — `digital_twin_status`.** `assertTwinPolicy` checks `!== "ready"` but the enum is `none|pending|approved|revoked` (`generate-requests.functions.ts:53`). No creator can ever pass → entire queue is dead.
2. **Enum mismatch — `persona.visibility`.** Checks `!== "published"` but enum is `draft|public|subscribers|vip|hidden` (`generate-requests.functions.ts:93`). Also always throws.
3. **Direct-generate path bypasses consent.** `ai-generate.functions.ts:66-206` — `saveGeneratedImage` and `generateVoiceNote` never call `assertTwinPolicy`. Revoked creators can still generate + save. `queueTalkingHead` correctly gates.
4. **Missing synthetic-labelling columns on direct-generate inserts.** Assets land as `source_type='real_upload'`, `internal_label='real_upload'`, `ai_disclosure_required=false`. Breaks fan-feed restricted filter and disclosure banner.

## Security / schema issues

- No storage RLS / path-prefix check on `getTwinRefSignedUrl` (`twin.functions.ts:301`).
- `/studio/*` routes have no server-side creator role gate — only `useEffect` redirects.
- `content_assets` has no `generation_request_id` FK — traceability gap.
- `upsertTwinConsent` doesn't require `signed_at` when `*_ok` flags flip true.
- No pack-type ↔ persona-kind compatibility guard.

## UX gaps

- `window.prompt()` for rejection reason (`studio.create.tsx:292`) — bad on mobile.
- No skeleton on `studio.create.tsx`; no per-route error boundaries.
- Seeded personas land as `draft` with no onboarding CTA → empty fan feed.
- Publish button on image tab disabled until stream final, no explainer copy.
- PWA: only favicon.ico in manifest, no maskable icons, no service worker → not installable.

---

# Recommended fix order

**Phase A — Unblock Create (critical, must ship first)**

1. Fix `assertTwinPolicy` enum checks:
   - `digital_twin_status !== "ready"` → `!== "approved"`
   - `visibility !== "published"` → `!["public","subscribers","vip"].includes(visibility)`
2. Add `assertTwinPolicy(kind, personaId, packId?)` calls to `saveGeneratedImage` (kind `image`) and `generateVoiceNote` (kind `voice`).
3. Backfill missing insert fields on all three direct-generate paths: `source_type: 'ai_generated'`, `internal_label: 'ai_draft'`, `ai_disclosure_required: true`.

**Phase B — Harden**

4. Add `beforeLoad` creator-role gate on the `_authenticated/studio` layout (redirect fans to `/` with a toast).
5. Path-prefix check in `getTwinRefSignedUrl`: reject unless path starts with `${creator.id}/`.
6. Migration: `content_assets.generation_request_id uuid REFERENCES generation_requests(id) ON DELETE SET NULL`, index it, backfill from `produced_asset_ids`. Update `publishRequestPlaceholders` + direct-generate paths to set it.
7. `upsertTwinConsent`: require `signed_at` when any `*_ok` flag is true.
8. Guard pack↔persona attach by kind (e.g. block `wicked` pack on `real_me` persona) in `attachPackToPersona`.

**Phase C — UX & PWA**

9. Replace `window.prompt` rejection with a proper `<Dialog>` + textarea.
10. Add per-route `errorComponent` + `pendingComponent` to every `studio.*.tsx`.
11. Onboarding banner in `studio.personas.tsx` when any default persona is still `draft`, with one-click publish.
12. PWA icons: generate 192, 512, and 512 maskable PNGs; wire them in `public/manifest.webmanifest`. Add a minimal service worker (offline shell + cache-first for static assets).

---

# Build prompt (to hand to the build agent after approval)

> Fix the Twinly Create audit findings in this order. Do not add new features.
>
> **A. Critical (in one migration-free code change):**
> 1. In `src/lib/generate-requests.functions.ts`, in `assertTwinPolicy`: change the `digital_twin_status` check from `"ready"` to `"approved"`, and change the persona visibility check to allow `visibility in ("public","subscribers","vip")` (reject the rest with the current error message).
> 2. In `src/lib/ai-generate.functions.ts`:
>    - Import `assertTwinPolicy` (export it from `generate-requests.functions.ts` if not exported yet, as an internal server-only helper — do not expose it as a `createServerFn`).
>    - Call `await assertTwinPolicy({ supabase, creatorId: creator.id, kind: "image", personaId, packId })` at the top of `saveGeneratedImage` handler, and `kind: "voice"` at the top of `generateVoiceNote`.
>    - On the insert payloads in `saveGeneratedImage`, `generateVoiceNote`, and `queueTalkingHead`, add: `source_type: "ai_generated"`, `internal_label: "ai_draft"`, `ai_disclosure_required: true`.
>
> **B. Harden:**
> 3. Create `src/routes/_authenticated/studio.tsx` (or update existing) with a `beforeLoad` that calls a server fn returning whether the user has a `creators` row (or `has_role` `creator`/`admin`); if not, `throw redirect({ to: "/", search: { toast: "creator-only" } })`.
> 4. In `src/lib/twin.functions.ts` `getTwinRefSignedUrl`, reject when `storagePath` does not start with `${creator.id}/`.
> 5. Migration `content_assets_generation_request_link`: add nullable `generation_request_id uuid references public.generation_requests(id) on delete set null`, index it, backfill from `generation_requests.produced_asset_ids`. Set it in `publishRequestPlaceholders`, `saveGeneratedImage`, `generateVoiceNote`, `queueTalkingHead`.
> 6. In `upsertTwinConsent`, if any of the `*_ok` flags in the payload is `true`, require `signed_at`; otherwise throw.
> 7. In `content-packs.functions.ts::attachPackToPersona`, reject when `pack.pack_type === "wicked"` and `persona.kind === "real_me"`.
>
> **C. UX & PWA:**
> 8. Replace the `window.prompt` in `src/routes/studio.create.tsx` rejection flow with a shadcn `Dialog` + `Textarea` + confirm button. Pass the reason to the existing server fn.
> 9. Add `errorComponent` and `pendingComponent` to every `src/routes/studio.*.tsx` route (spinner + retry that calls `router.invalidate()` and `reset()`).
> 10. In `src/routes/studio.personas.tsx`, if any persona has `is_default_seed && visibility === 'draft'`, render a top banner "Publish your default personas to appear in Discover" with a one-click publish action.
> 11. Generate 192×192, 512×512, and 512×512 maskable PNG icons for the Twin-T logo into `public/icons/`. Update `public/manifest.webmanifest` `icons` array to reference them (`purpose: "any"` and `purpose: "maskable"`).
> 12. Add a Vite PWA plugin config (or a minimal `public/sw.js` + registration in `__root.tsx`) that caches the app shell and lets Twinly install on iOS/Android.
>
> Verify with `tsgo` after each phase and take a Playwright screenshot of `/studio/create` and `/studio/generate` after Phase A to confirm the queue is no longer permanently blocked. Do not touch auto-generated files under `src/integrations/supabase/` or `src/routeTree.gen.ts`.
