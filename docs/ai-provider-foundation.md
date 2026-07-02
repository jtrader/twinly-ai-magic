# AI Provider Foundation

## Goal

Prepare Twinly Create for real AI image, audio, talking-head, and video generation without locking the product into one vendor too early.

This foundation keeps the existing creator workflow intact:

```text
Creator creates a generation request
  -> Twinly validates consent, permissions, moderation, and cost
  -> Provider adapter submits the job
  -> Generated outputs become AI Draft assets
  -> Creator reviews and approves
  -> Approved assets can be published to persona libraries
```

The first implementation uses a mock provider only. Real providers should be added behind the same adapter interface later.

## Architecture

```text
Creator UI
  -> generation_requests
  -> Generation Orchestrator
  -> pre-generation moderation
  -> Provider Registry
  -> Provider Adapter
  -> generation_jobs
  -> content_assets as AI Drafts
  -> post-generation moderation
  -> quality scoring
  -> Creator Review Queue
  -> persona_content_permissions
  -> fan-facing persona library
```

## Design rules

- Do not call AI vendors directly from React components.
- Do not expose provider API keys to the browser.
- Do not publish generated assets automatically.
- Do not generate synthetic assets unless digital twin consent is valid.
- Do not mix creator reference assets across creators.
- Do not hard-code persona names; personas remain dynamic records.
- All synthetic assets require AI disclosure metadata.
- All publish/unpublish/restrict actions should be auditable.

## Database additions

The migration in `supabase/migrations/20260703000100_ai_provider_foundation.sql` adds:

- `ai_providers`
- `ai_provider_models`
- `generation_jobs`
- `generation_moderation_checks`
- `generation_quality_scores`
- `generation_cost_events`
- `asset_publication_events`

These tables sit around the existing `generation_requests`, `content_assets`, `content_packs`, `personas`, `digital_twin_consent`, `moderation_events`, and `audit_logs` tables.

## Provider abstraction

The provider layer lives in `src/lib/ai-generation`.

Core files:

- `types.ts` — shared provider/orchestration types
- `provider-registry.ts` — provider lookup and fallback selection
- `providers/mock-provider.ts` — safe fake provider for local/product testing
- `orchestrator.ts` — validation and orchestration helpers
- `index.ts` — public exports

## Generation lifecycle

```text
draft
  -> queued
  -> pre_generation_moderation
  -> blocked OR submitted
  -> provider_processing
  -> failed OR generated
  -> post_generation_moderation
  -> needs_review
  -> approved OR rejected
  -> published OR restricted OR do_not_use
```

## Moderation lifecycle

Moderation should run at four points:

1. `pre_generation` — prompt, persona, consent, pack, and boundary checks.
2. `provider_input` — final sanitised payload before a vendor receives it.
3. `post_generation` — generated image/audio/video/text checks.
4. `pre_publish` — final block before fan-facing publication.

## Cost tracking

Track cost at these levels:

- estimated request cost
- provider job cost
- output asset cost
- creator/month cost
- cost per approved asset
- cost per published asset

The new `generation_cost_events` table supports request-level and job-level cost records.

## Provider switching

Providers are selected by output type and priority. Real adapters should implement the same `GenerationProviderAdapter` interface as the mock provider.

Recommended future adapters:

- image provider
- voice provider
- talking-head/avatar provider
- short-video provider
- moderation provider
- identity/style scoring provider

Keep providers swappable through `ProviderRegistry`, not through UI conditionals.

## Next implementation steps

1. Run the Supabase migration.
2. Regenerate Supabase types.
3. Wire `orchestrateGenerationRequest` into the submit-generation action.
4. Use `MockGenerationProvider` to create review-queue placeholder assets.
5. Add webhook shell endpoints for future providers.
6. Add real provider adapters one at a time.
7. Add provider-specific webhook signature verification before production use.
