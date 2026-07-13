
-- 1. Revoke EXECUTE on log_audit from public/authenticated (SECURITY DEFINER mutation).
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO service_role;

-- 2. Restrict SELECT on sensitive creator columns to service_role only.
-- Public reads must go through owner/admin/agency server functions using the admin client.
REVOKE SELECT (payout_status, verification_provider, verification_provider_ref, generation_spend_cap_cents)
  ON public.creators FROM anon, authenticated;
