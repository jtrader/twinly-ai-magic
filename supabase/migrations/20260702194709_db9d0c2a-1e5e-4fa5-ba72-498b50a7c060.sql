ALTER TABLE public.content_assets ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.content_packs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.content_packs ADD COLUMN IF NOT EXISTS review_feedback text;
ALTER TABLE public.content_packs ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS content_assets_tags_gin ON public.content_assets USING GIN (tags);
CREATE INDEX IF NOT EXISTS content_packs_tags_gin ON public.content_packs USING GIN (tags);