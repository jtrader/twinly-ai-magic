# OAuth Sign-in + Admin Seeding

## Heads up on Microsoft
Lovable Cloud managed auth natively supports **Google** and **Apple** only. **Microsoft is not available** as a managed provider. Options:
- **A (recommended):** Ship Google + Apple now, defer Microsoft.
- **B:** Migrate off Lovable Cloud managed auth to a self-configured Supabase project so Azure AD/Microsoft can be wired via the Supabase dashboard (larger change, affects existing auth wiring).

Plan below assumes **Option A**. Tell me if you want B instead.

## 1. Enable providers
- Call `supabase--configure_social_auth` with `providers: ["google", "apple"]`. Keep email/password enabled (already in use for demo magic links + existing signups).
- Google uses Lovable-managed credentials by default — no keys needed.
- Apple uses Lovable-managed credentials by default. If you later want your own Apple Developer branding, we can switch to BYOC.

## 2. Auth UI updates (`src/routes/auth.tsx`)
- Add "Continue with Google" and "Continue with Apple" buttons above the email form on both Sign in and Sign up tabs.
- Wire both to `lovable.auth.signInWithOAuth("<provider>", { redirect_uri: window.location.origin + "/auth/callback" })` using `@/integrations/lovable`.
- Preserve any `redirect` search param (e.g. consent flows, protected route hand-off) via `sessionStorage` and consume it on the callback route.
- Handle `result.error` with existing toast pattern; return early on `result.redirected`.
- Apple button uses Apple's brand styling (black bg, white Apple glyph); Google button uses neutral bordered style with color G mark. Both full-width, matching existing button sizing.

## 3. Post-OAuth callback (`src/routes/auth.callback.tsx` — new)
- Public route (no auth gate).
- Waits for `supabase.auth.getSession()` / `onAuthStateChange` to confirm session.
- Reads sanitized same-origin path from `sessionStorage` and navigates there (default `/discover`).
- Renders a lightweight "Signing you in…" state with an error fallback.

## 4. Profile auto-provisioning
`handle_new_user()` trigger already creates a `profiles` row + `fan` role for any new `auth.users` insert (including OAuth signups). Confirmed — no schema change needed. Google `full_name`/`avatar_url` and Apple's name (first sign-in only) flow into `raw_user_meta_data` and populate `display_name`/`avatar_url`.

## 5. Admin seeding — support@lovekey.com.au
Because the account doesn't exist yet, we can't grant the role directly today. Two-layer approach so it works whether they sign up via OAuth or email:

**Layer A — Migration (idempotent):**
- If a user with that email already exists in `auth.users`, insert `(user_id, 'admin')` into `user_roles` (`ON CONFLICT DO NOTHING`). No-op on first run since the account doesn't exist yet.

**Layer B — Trigger for future signup:**
- Extend `handle_new_user()` (or add a companion `AFTER INSERT` trigger on `auth.users`) to check `NEW.email = 'support@lovekey.com.au'` and, when true, insert an `admin` role in addition to the default `fan` role.
- Also handle the `email_confirmed_at` update path (mirrors the verified-domain pattern in the security knowledge) so an admin role isn't granted before the mailbox is verified.

Result: whenever support@lovekey.com.au completes signup + email verification (via Google, Apple, or email/password), they automatically become admin and can access `/admin`.

## 6. Verification
- Typecheck.
- Manual: click Google button in preview → confirm session lands on `/discover`; click Apple button → same.
- SQL check post-signup: `select role from user_roles where user_id = (select id from auth.users where email = 'support@lovekey.com.au')` returns `admin` + `fan`.

## Files touched
- `src/routes/auth.tsx` (add OAuth buttons)
- `src/routes/auth.callback.tsx` (new)
- One migration: extend `handle_new_user()` + backfill admin role if user exists
- Tool call: `supabase--configure_social_auth`

## Not in scope
- Microsoft/Azure AD (blocked by managed auth; needs decision above)
- Apple BYOC credentials (using managed default)
- Changes to existing email/password or magic-link flows
