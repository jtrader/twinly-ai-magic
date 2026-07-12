-- Per-persona content-category allow/disallow. Generalized from the app's
-- existing category primitives (persona tiers, digital_twin_consent's
-- allowed_uses/forbidden_uses presets) since the external Twinly Content
-- library's real category vocabulary was never observed in this environment
-- (see twinly-content.server.ts / persona-onboarding-generation.server.ts).
-- This is additive to, not a replacement for, the platform-wide absolute
-- blocks already enforced via forbidden_uses (no_minors, no_impersonation,
-- etc.) — those remain non-negotiable and are not part of this per-persona
-- toggle set.
CREATE TYPE public.content_theme AS ENUM (
  'romantic_affection',
  'flirtation_teasing',
  'roleplay_fantasy',
  'power_exchange',
  'fetish_general',
  'group_dynamics',
  'exhibitionism_voyeurism',
  'sensory_focus'
);

-- jsonb map of theme -> boolean. Absent key or true = allowed (preserves
-- existing behavior for every persona created before this feature);
-- explicit false = disallowed for that persona's chat.
ALTER TABLE public.personas ADD COLUMN content_theme_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
