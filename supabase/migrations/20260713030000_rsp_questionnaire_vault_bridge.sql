-- RSP bridge source/derived stores. Raw answers are ciphertext only; no content bodies or supporter identifiers enter vault queries.
create table public.rsp_questionnaire_submissions (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id), supporter_id uuid not null references auth.users(id),
 schema_version text not null, questionnaire_version text not null, source text not null, locale text not null, status text not null default 'received',
 ciphertext text not null, nonce text not null, authentication_tag text not null, wrapped_data_key text not null, wrap_nonce text not null,
 wrap_authentication_tag text not null, encryption_algorithm text not null check(encryption_algorithm='AES-256-GCM'), key_version text not null,
 associated_data_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default now(), processed_at timestamptz, deleted_at timestamptz
);
create table public.rsp_consent_receipts (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 consent_version text not null, accepted_at timestamptz not null, adult_confirmed boolean not null, respectful_use_accepted boolean not null,
 personalisation_allowed boolean not null, preferences_may_be_saved boolean not null, receipt_hash text not null unique, created_at timestamptz not null default now()
);
create table public.rsp_policy_envelopes (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 creator_id uuid not null references public.creators(id), policy_version text not null, policy_hash text not null unique, envelope jsonb not null,
 active boolean not null default true, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_privacy_safe_profiles (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 creator_id uuid not null references public.creators(id), profile_token uuid unique, profile_version text not null, profile jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null, deleted_at timestamptz,
 check(profile ? 'displayName' = false and profile ? 'email' = false and profile ? 'supporterId' = false)
);
create table public.rsp_state_profiles (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 state_version text not null, states jsonb not null, quality jsonb not null, cluster_summaries jsonb not null, created_at timestamptz not null default now(),
 check(abs(((states->>'fire')::numeric+(states->>'air')::numeric+(states->>'earth')::numeric+(states->>'water')::numeric+(states->>'ether')::numeric)-1)<=0.001)
);
create table public.questionnaire_metatag_mappings (
 id uuid primary key default gen_random_uuid(), mapping_version text not null, questionnaire_schema_version text not null,
 field_path text not null, source_value text, source_range_min numeric, source_range_max numeric, output_namespace text not null,
 output_tag_id text, state_contribution_json jsonb not null default '{}', hard_policy_effect jsonb not null default '{}',
 confidence numeric(4,3) not null check(confidence between 0 and 1), status text not null default 'draft', reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(mapping_version,field_path,source_value,source_range_min,source_range_max,output_tag_id)
);
create table public.rsp_vault_retrieval_requests (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 creator_id uuid not null references public.creators(id), request_id uuid not null unique, policy_hash text not null, retrieval_version text not null,
 tag_schema_version text not null, ranking_version text not null, request_projection jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_curated_sequences (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.rsp_privacy_safe_profiles(id) on delete cascade,
 creator_id uuid not null references public.creators(id), sequence_version text not null, policy_hash text not null, persona text not null,
 relationship_stage text not null, objective text not null, runtime_rules jsonb not null, status text not null default 'draft',
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table public.rsp_curated_sequence_steps (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.rsp_curated_sequences(id) on delete cascade,
 position integer not null check(position>0), journey_stage text not null, asset_id uuid not null, asset_version integer not null check(asset_version>0),
 fallback_asset_id uuid, match_score numeric(5,4) not null check(match_score between 0 and 1), match_explanation jsonb not null,
 transition_rules jsonb not null, unique(sequence_id,position)
);
create table public.rsp_generated_briefs (
 id uuid primary key default gen_random_uuid(), sequence_id uuid not null references public.rsp_curated_sequences(id) on delete cascade,
 brief_type text not null check(brief_type in ('chat_experience','tailored_content')), schema_version text not null, brief jsonb not null,
 status text not null default 'editable_draft', created_at timestamptz not null default now(), unique(sequence_id,brief_type)
);
create table public.rsp_audit_events (
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id), actor_id uuid,
 submission_id uuid references public.rsp_questionnaire_submissions(id) on delete set null, event_type text not null, purpose text not null,
 category_metadata jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create table public.rsp_retention_deletion_jobs (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.rsp_questionnaire_submissions(id) on delete cascade,
 idempotency_key text not null unique, status text not null default 'queued', attempts integer not null default 0, run_after timestamptz not null,
 completed_at timestamptz, error_class text, created_at timestamptz not null default now()
);
create index rsp_submission_scope_idx on public.rsp_questionnaire_submissions(creator_id,supporter_id,status);
create index rsp_submission_expiry_idx on public.rsp_questionnaire_submissions(expires_at) where deleted_at is null;
create index rsp_profile_scope_idx on public.rsp_privacy_safe_profiles(creator_id,expires_at) where deleted_at is null;
create index rsp_sequence_scope_idx on public.rsp_curated_sequences(creator_id,status,expires_at);
create index rsp_deletion_due_idx on public.rsp_retention_deletion_jobs(status,run_after);
do $$ declare t text; begin foreach t in array array['rsp_questionnaire_submissions','rsp_consent_receipts','rsp_policy_envelopes','rsp_privacy_safe_profiles','rsp_state_profiles','questionnaire_metatag_mappings','rsp_vault_retrieval_requests','rsp_curated_sequences','rsp_curated_sequence_steps','rsp_generated_briefs','rsp_audit_events','rsp_retention_deletion_jobs'] loop execute format('alter table public.%I enable row level security',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create policy "Supporters own encrypted submissions" on public.rsp_questionnaire_submissions for all to authenticated using(supporter_id=auth.uid()) with check(supporter_id=auth.uid());
grant select on public.rsp_curated_sequences,public.rsp_curated_sequence_steps,public.rsp_generated_briefs to authenticated;
create policy "Creators review scoped sequences" on public.rsp_curated_sequences for select to authenticated using(public.can_manage_creator(creator_id) or exists(select 1 from public.rsp_privacy_safe_profiles p join public.rsp_questionnaire_submissions s on s.id=p.submission_id where p.id=rsp_curated_sequences.profile_id and s.supporter_id=auth.uid()));
create policy "Scoped sequence step reads" on public.rsp_curated_sequence_steps for select to authenticated using(exists(select 1 from public.rsp_curated_sequences q where q.id=sequence_id and (public.can_manage_creator(q.creator_id) or exists(select 1 from public.rsp_privacy_safe_profiles p join public.rsp_questionnaire_submissions s on s.id=p.submission_id where p.id=q.profile_id and s.supporter_id=auth.uid()))));
create policy "Scoped generated brief reads" on public.rsp_generated_briefs for select to authenticated using(exists(select 1 from public.rsp_curated_sequences q where q.id=sequence_id and (public.can_manage_creator(q.creator_id) or exists(select 1 from public.rsp_privacy_safe_profiles p join public.rsp_questionnaire_submissions s on s.id=p.submission_id where p.id=q.profile_id and s.supporter_id=auth.uid()))));
create policy "Admins manage mappings" on public.questionnaire_metatag_mappings for all to authenticated using(public.has_role(auth.uid(),'admin')) with check(public.has_role(auth.uid(),'admin'));
-- All other derived tables are service-role only. Routine UI never has ciphertext/decryption access.
