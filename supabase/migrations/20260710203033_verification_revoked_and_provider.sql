-- Design doc item 1: verification gates.
ALTER TYPE public.verification_status ADD VALUE IF NOT EXISTS 'revoked';

ALTER TABLE public.creators
  ADD COLUMN verification_provider TEXT,
  ADD COLUMN verification_provider_ref TEXT;
