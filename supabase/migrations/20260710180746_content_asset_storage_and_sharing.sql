-- Per-persona 5GB storage cap + global-share support.
-- byte_size is populated server-side at upload time (see resolveByteSize in
-- content-vault.functions.ts); assets with only an external_url (no bucket
-- object) keep byte_size null and don't count toward any quota.
-- shared_across_personas = true means the asset is visible in every one of
-- the creator's personas' libraries (a "Global" folder) without being
-- individually attached via persona_content_permissions, and does not count
-- toward any single persona's 5GB cap.
ALTER TABLE public.content_assets
  ADD COLUMN byte_size BIGINT,
  ADD COLUMN shared_across_personas BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_content_assets_shared ON public.content_assets(creator_id) WHERE shared_across_personas = true;
