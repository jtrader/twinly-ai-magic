-- Design doc item 3: consent ledger.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Likeness use (existing signed_at/revoked_at) and AI-training consent
-- tracked independently — a creator can grant one without the other.
ALTER TABLE public.digital_twin_consent
  ADD COLUMN training_consent_signed_at TIMESTAMPTZ,
  ADD COLUMN training_consent_revoked_at TIMESTAMPTZ;

-- Tamper-evident hash chain on the existing history table.
ALTER TABLE public.consent_records
  ADD COLUMN record_hash TEXT,
  ADD COLUMN prev_hash TEXT;

-- Lock the ledger down to append-only-via-trigger: creators could
-- previously INSERT/UPDATE/DELETE this table directly (same grant as any
-- other owned row), which would make a hash chain meaningless — anyone
-- with write access could just recompute forward. The trigger function
-- below is SECURITY DEFINER, so it keeps writing even with these grants
-- narrowed to SELECT only.
REVOKE INSERT, UPDATE, DELETE ON public.consent_records FROM authenticated;
DROP POLICY IF EXISTS "Creator/agency manages consent records" ON public.consent_records;
CREATE POLICY "Creator/agency reads own consent records"
  ON public.consent_records FOR SELECT USING (public.can_manage_creator(creator_id));

CREATE OR REPLACE FUNCTION public.append_consent_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_hash TEXT;
  _payload TEXT;
  _new_hash TEXT;
  _now TIMESTAMPTZ := now();
  _training_changed BOOLEAN := (TG_OP = 'INSERT');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _training_changed := (NEW.training_consent_signed_at IS DISTINCT FROM OLD.training_consent_signed_at)
                       OR (NEW.training_consent_revoked_at IS DISTINCT FROM OLD.training_consent_revoked_at);
  END IF;

  -- Likeness-use entry: unchanged behavior from before (fires on every
  -- insert/update of the row, same as the original trigger). created_at
  -- below uses the same `now()` captured here, so the hash is fully
  -- re-derivable later from nothing but the row's own persisted columns.
  SELECT record_hash INTO _prev_hash
    FROM public.consent_records
    WHERE creator_id = NEW.creator_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  _payload := coalesce(_prev_hash, '') || '|' || NEW.creator_id::text || '|digital_twin|' ||
              coalesce(NEW.signed_at::text, '') || '|' || coalesce(NEW.revoked_at::text, '') || '|' || _now::text;
  _new_hash := encode(digest(_payload, 'sha256'), 'hex');
  INSERT INTO public.consent_records (creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at)
  VALUES (NEW.creator_id, 'digital_twin', NEW.signed_at, NEW.revoked_at, _prev_hash, _new_hash, _now);

  -- AI-training entry: only when the training consent fields actually changed.
  IF _training_changed THEN
    SELECT record_hash INTO _prev_hash
      FROM public.consent_records
      WHERE creator_id = NEW.creator_id
      ORDER BY created_at DESC, id DESC LIMIT 1;
    _payload := coalesce(_prev_hash, '') || '|' || NEW.creator_id::text || '|ai_training|' ||
                coalesce(NEW.training_consent_signed_at::text, '') || '|' || coalesce(NEW.training_consent_revoked_at::text, '') || '|' || _now::text;
    _new_hash := encode(digest(_payload, 'sha256'), 'hex');
    INSERT INTO public.consent_records (creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at)
    VALUES (NEW.creator_id, 'ai_training', NEW.training_consent_signed_at, NEW.training_consent_revoked_at, _prev_hash, _new_hash, _now);
  END IF;

  RETURN NEW;
END;
$$;

-- Admin-only integrity check: fully recomputes each row's hash from its own
-- stored columns + the previous row's stored hash, and reports every break
-- (not just linkage — a row whose content was altered post-hoc but whose
-- record_hash was left untouched, or vice versa, both fail here).
CREATE OR REPLACE FUNCTION public.verify_consent_ledger_integrity(_creator_id UUID)
RETURNS TABLE(record_id UUID, ok BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  _running_prev TEXT := NULL;
  _payload TEXT;
  _expected_hash TEXT;
BEGIN
  FOR r IN
    SELECT id, creator_id, kind, valid_from, revoked_at, prev_hash, record_hash, created_at
    FROM public.consent_records
    WHERE creator_id = _creator_id
    ORDER BY created_at ASC, id ASC
  LOOP
    IF r.record_hash IS NULL THEN
      CONTINUE; -- pre-hash-chain row, written before this migration
    END IF;
    _payload := coalesce(_running_prev, '') || '|' || r.creator_id::text || '|' || r.kind || '|' ||
                coalesce(r.valid_from::text, '') || '|' || coalesce(r.revoked_at::text, '') || '|' || r.created_at::text;
    _expected_hash := encode(digest(_payload, 'sha256'), 'hex');
    record_id := r.id;
    ok := (r.prev_hash IS NOT DISTINCT FROM _running_prev) AND (r.record_hash = _expected_hash);
    _running_prev := r.record_hash;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_consent_ledger_integrity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_consent_ledger_integrity(uuid) TO service_role;
