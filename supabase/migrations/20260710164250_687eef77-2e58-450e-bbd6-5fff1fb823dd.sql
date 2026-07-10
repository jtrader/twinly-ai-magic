
ALTER VIEW public.creators_public SET (security_invoker = false);
ALTER VIEW public.profiles_public SET (security_invoker = false);
GRANT SELECT ON public.creators_public TO anon, authenticated;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
