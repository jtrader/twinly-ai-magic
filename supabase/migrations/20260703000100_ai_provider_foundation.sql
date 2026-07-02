-- AI provider foundation for Twinly Create.
-- This migration keeps real AI vendors behind a provider-agnostic job layer.

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_key text not null unique,
  supported_output_types public.generation_output_type[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'deprecated')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_provider_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  model_key text not null,
  output_type public.generation_output_type not null,
  supports_identity_refs boolean not null default false,
  supports_voice_refs boolean not null default false,
  supports_video_refs boolean not null default false,
  supports_webhook boolean not null default false,
  max_quantity integer not null default 1 check (max_quantity > 0),
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'deprecated')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, model_key, output_type)
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  generation_request_id uuid not null references public.generation_requests(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  pack_id uuid references public.content_packs(id) on delete set null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  provider_model_id uuid references public.ai_provider_models(id) on delete set null,
  provider_job_id text,
  output_type public.generation_output_type not null,
  status text not null default 'queued' check (status in ('queued', 'submitted', 'polling', 'completed', 'failed', 'cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_moderation_checks (
  id uuid primary key default gen_random_uuid(),
  generation_request_id uuid references public.generation_requests(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete cascade,
  asset_id uuid references public.content_assets(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  check_stage text not null check (check_stage in ('pre_generation', 'provider_input', 'post_generation', 'pre_publish')),
  check_type text not null check (check_type in ('prompt', 'image', 'audio', 'video', 'metadata')),
  status text not null default 'clean' check (status in ('clean', 'flagged', 'blocked', 'needs_review')),
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  categories text[] not null default '{}',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint generation_moderation_subject_check check (
    generation_request_id is not null or generation_job_id is not null or asset_id is not null
  )
);

create table if not exists public.generation_quality_scores (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  creator_id uuid not null references public.creators(id) on delete cascade,
  identity_score numeric(5,2) check (identity_score is null or (identity_score >= 0 and identity_score <= 100)),
  style_score numeric(5,2) check (style_score is null or (style_score >= 0 and style_score <= 100)),
  voice_score numeric(5,2) check (voice_score is null or (voice_score >= 0 and voice_score <= 100)),
  persona_alignment_score numeric(5,2) check (persona_alignment_score is null or (persona_alignment_score >= 0 and persona_alignment_score <= 100)),
  artifact_score numeric(5,2) check (artifact_score is null or (artifact_score >= 0 and artifact_score <= 100)),
  overall_score numeric(5,2) check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_cost_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  generation_request_id uuid references public.generation_requests(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete cascade,
  provider_id uuid references public.ai_providers(id) on delete set null,
  provider_model_id uuid references public.ai_provider_models(id) on delete set null,
  output_type public.generation_output_type not null,
  units integer not null default 1 check (units > 0),
  unit_type text not null default 'render',
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  actual_cost_cents integer check (actual_cost_cents is null or actual_cost_cents >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists public.asset_publication_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.content_assets(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  creator_id uuid not null references public.creators(id) on delete cascade,
  published_by uuid references auth.users(id) on delete set null,
  publication_status text not null check (publication_status in ('published', 'unpublished', 'restricted', 'do_not_use')),
  ai_disclosure_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_provider_models_provider_id on public.ai_provider_models(provider_id);
create index if not exists idx_ai_provider_models_output_type on public.ai_provider_models(output_type);

create index if not exists idx_generation_jobs_request_id on public.generation_jobs(generation_request_id);
create index if not exists idx_generation_jobs_creator_id on public.generation_jobs(creator_id);
create index if not exists idx_generation_jobs_persona_id on public.generation_jobs(persona_id);
create index if not exists idx_generation_jobs_pack_id on public.generation_jobs(pack_id);
create index if not exists idx_generation_jobs_provider_id on public.generation_jobs(provider_id);
create index if not exists idx_generation_jobs_status on public.generation_jobs(status);
create index if not exists idx_generation_jobs_created_at on public.generation_jobs(created_at);

create index if not exists idx_generation_moderation_request_id on public.generation_moderation_checks(generation_request_id);
create index if not exists idx_generation_moderation_job_id on public.generation_moderation_checks(generation_job_id);
create index if not exists idx_generation_moderation_asset_id on public.generation_moderation_checks(asset_id);
create index if not exists idx_generation_moderation_creator_id on public.generation_moderation_checks(creator_id);
create index if not exists idx_generation_moderation_status on public.generation_moderation_checks(status);

create index if not exists idx_generation_quality_asset_id on public.generation_quality_scores(asset_id);
create index if not exists idx_generation_quality_job_id on public.generation_quality_scores(generation_job_id);
create index if not exists idx_generation_quality_creator_id on public.generation_quality_scores(creator_id);

create index if not exists idx_generation_cost_creator_id on public.generation_cost_events(creator_id);
create index if not exists idx_generation_cost_request_id on public.generation_cost_events(generation_request_id);
create index if not exists idx_generation_cost_job_id on public.generation_cost_events(generation_job_id);
create index if not exists idx_generation_cost_provider_id on public.generation_cost_events(provider_id);
create index if not exists idx_generation_cost_created_at on public.generation_cost_events(created_at);

create index if not exists idx_asset_publication_asset_id on public.asset_publication_events(asset_id);
create index if not exists idx_asset_publication_persona_id on public.asset_publication_events(persona_id);
create index if not exists idx_asset_publication_creator_id on public.asset_publication_events(creator_id);
create index if not exists idx_asset_publication_created_at on public.asset_publication_events(created_at);

alter table public.ai_providers enable row level security;
alter table public.ai_provider_models enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_moderation_checks enable row level security;
alter table public.generation_quality_scores enable row level security;
alter table public.generation_cost_events enable row level security;
alter table public.asset_publication_events enable row level security;

create policy "Admins can manage AI providers"
  on public.ai_providers
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Authenticated users can read active AI providers"
  on public.ai_providers
  for select
  using (auth.uid() is not null and status = 'active');

create policy "Admins can manage AI provider models"
  on public.ai_provider_models
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Authenticated users can read active AI provider models"
  on public.ai_provider_models
  for select
  using (
    auth.uid() is not null
    and status = 'active'
    and exists (
      select 1
      from public.ai_providers p
      where p.id = provider_id
        and p.status = 'active'
    )
  );

create policy "Managers can manage generation jobs"
  on public.generation_jobs
  for all
  using (public.can_manage_creator(creator_id))
  with check (public.can_manage_creator(creator_id));

create policy "Admins can manage all generation jobs"
  on public.generation_jobs
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Managers can manage generation moderation checks"
  on public.generation_moderation_checks
  for all
  using (public.can_manage_creator(creator_id))
  with check (public.can_manage_creator(creator_id));

create policy "Admins can manage all generation moderation checks"
  on public.generation_moderation_checks
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Managers can read generation quality scores"
  on public.generation_quality_scores
  for select
  using (public.can_manage_creator(creator_id));

create policy "Admins can manage generation quality scores"
  on public.generation_quality_scores
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Managers can read generation cost events"
  on public.generation_cost_events
  for select
  using (public.can_manage_creator(creator_id));

create policy "Admins can manage generation cost events"
  on public.generation_cost_events
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

create policy "Managers can manage asset publication events"
  on public.asset_publication_events
  for all
  using (public.can_manage_creator(creator_id))
  with check (public.can_manage_creator(creator_id));

create policy "Admins can manage all asset publication events"
  on public.asset_publication_events
  for all
  using (public.has_role('admin', auth.uid()))
  with check (public.has_role('admin', auth.uid()));

insert into public.ai_providers (name, provider_key, supported_output_types, status, config)
values (
  'Mock Provider',
  'mock',
  array['image', 'audio', 'video', 'talking_head', 'promo_banner']::public.generation_output_type[],
  'active',
  '{"description":"Local placeholder provider for Twinly Create workflow testing."}'::jsonb
)
on conflict (provider_key) do update set
  name = excluded.name,
  supported_output_types = excluded.supported_output_types,
  status = excluded.status,
  config = excluded.config,
  updated_at = now();

insert into public.ai_provider_models (
  provider_id,
  model_key,
  output_type,
  supports_identity_refs,
  supports_voice_refs,
  supports_video_refs,
  supports_webhook,
  max_quantity,
  estimated_cost_cents,
  status,
  config
)
select
  p.id,
  model_key,
  output_type,
  supports_identity_refs,
  supports_voice_refs,
  supports_video_refs,
  false,
  10,
  estimated_cost_cents,
  'active',
  '{}'::jsonb
from public.ai_providers p
cross join (values
  ('mock-image-v1', 'image'::public.generation_output_type, true, false, false, 10),
  ('mock-audio-v1', 'audio'::public.generation_output_type, false, true, false, 8),
  ('mock-video-v1', 'video'::public.generation_output_type, true, false, true, 25),
  ('mock-talking-head-v1', 'talking_head'::public.generation_output_type, true, true, true, 20),
  ('mock-promo-banner-v1', 'promo_banner'::public.generation_output_type, true, false, false, 5)
) as models(model_key, output_type, supports_identity_refs, supports_voice_refs, supports_video_refs, estimated_cost_cents)
where p.provider_key = 'mock'
on conflict (provider_id, model_key, output_type) do update set
  supports_identity_refs = excluded.supports_identity_refs,
  supports_voice_refs = excluded.supports_voice_refs,
  supports_video_refs = excluded.supports_video_refs,
  max_quantity = excluded.max_quantity,
  estimated_cost_cents = excluded.estimated_cost_cents,
  status = excluded.status,
  updated_at = now();

comment on table public.ai_providers is 'Provider registry for AI generation vendors. Real vendors should be accessed only through server-side adapters.';
comment on table public.ai_provider_models is 'Provider model registry with output-type support and cost estimates.';
comment on table public.generation_jobs is 'Provider-level jobs created from creator-facing generation requests.';
comment on table public.generation_moderation_checks is 'Append-only moderation checkpoints across the generation lifecycle.';
comment on table public.generation_quality_scores is 'Internal consistency and quality scores for generated assets.';
comment on table public.generation_cost_events is 'Cost estimate and actual cost records for generation jobs.';
comment on table public.asset_publication_events is 'Append-only publication/audit events for assets assigned to persona libraries.';
