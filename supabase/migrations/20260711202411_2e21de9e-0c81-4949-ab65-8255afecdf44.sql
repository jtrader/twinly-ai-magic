INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('creator'::public.app_role), ('agency'::public.app_role), ('fan'::public.app_role)) AS r(role)
WHERE lower(u.email) = 'support@lovekey.com.au'
ON CONFLICT (user_id, role) DO NOTHING;