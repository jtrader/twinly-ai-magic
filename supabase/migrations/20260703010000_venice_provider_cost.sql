-- Track per-asset generation cost so creator analytics (volume/cost) and the
-- rate-limit/cost-estimation UI have a real number to aggregate, rather than
-- inferring cost from provider + category strings.
ALTER TABLE public.content_assets
  ADD COLUMN IF NOT EXISTS cost_cents INTEGER;

COMMENT ON COLUMN public.content_assets.cost_cents IS
  'Provider-reported or estimated generation cost in USD cents for this asset. NULL for non-generated (real_upload) assets.';
