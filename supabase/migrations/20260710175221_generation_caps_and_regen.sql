-- Per-creator monthly generation spend cap (admin-configurable; null = unlimited).
-- Enforced in publishRequestPlaceholders against SUM(content_assets.cost_cents).
ALTER TABLE public.creators
  ADD COLUMN generation_spend_cap_cents INT;

-- Regeneration lineage for rejected/failed generation_requests, so retries
-- can be capped per original request instead of retried indefinitely.
ALTER TABLE public.generation_requests
  ADD COLUMN regenerated_from_id UUID REFERENCES public.generation_requests(id) ON DELETE SET NULL,
  ADD COLUMN regeneration_count INT NOT NULL DEFAULT 0;
