
-- =====================================================================
-- ROLES + PROFILES
-- =====================================================================

CREATE TYPE public.app_role AS ENUM ('fan', 'creator', 'agency', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  handle TEXT UNIQUE,
  country TEXT,
  dob_attested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profile policies
CREATE POLICY "Profiles readable by anyone signed in or anon"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users manage own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles policies
CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles"
  ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + default fan role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'fan')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- AGENCIES + CREATORS
-- =====================================================================

CREATE TYPE public.verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE public.payout_status AS ENUM ('none', 'pending', 'active');
CREATE TYPE public.twin_status AS ENUM ('none', 'pending', 'approved', 'revoked');

CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  stage_name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  payout_status public.payout_status NOT NULL DEFAULT 'none',
  digital_twin_status public.twin_status NOT NULL DEFAULT 'none',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creators TO authenticated;
GRANT SELECT ON public.creators TO anon;
GRANT ALL ON public.creators TO service_role;
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agency_creators (
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, creator_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_creators TO authenticated;
GRANT ALL ON public.agency_creators TO service_role;
ALTER TABLE public.agency_creators ENABLE ROW LEVEL SECURITY;

-- Helper: is caller a member of agency managing creator
CREATE OR REPLACE FUNCTION public.can_manage_creator(_creator_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = _creator_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.agency_creators ac
    JOIN public.agencies a ON a.id = ac.agency_id
    WHERE ac.creator_id = _creator_id AND a.owner_user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "Anyone can view verified creators"
  ON public.creators FOR SELECT USING (true);
CREATE POLICY "Creator manages own record"
  ON public.creators FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Agency can view/update managed creators"
  ON public.creators FOR UPDATE USING (public.can_manage_creator(id)) WITH CHECK (public.can_manage_creator(id));
CREATE POLICY "Admins manage creators"
  ON public.creators FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agency owner manages own agency"
  ON public.agencies FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Admins manage agencies"
  ON public.agencies FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agency owner manages links"
  ON public.agency_creators FOR ALL USING (
    EXISTS (SELECT 1 FROM public.agencies WHERE id = agency_id AND owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.agencies WHERE id = agency_id AND owner_user_id = auth.uid())
  );
CREATE POLICY "Creator sees own agency links"
  ON public.agency_creators FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid())
  );

-- =====================================================================
-- CREATOR VOICE PROFILE
-- =====================================================================
CREATE TABLE public.creator_voice_profiles (
  creator_id UUID PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE,
  tone_summary TEXT,
  vocabulary_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  boundary_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  sales_style TEXT,
  banned_phrases TEXT[] NOT NULL DEFAULT '{}',
  approved_phrases TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_voice_profiles TO authenticated;
GRANT ALL ON public.creator_voice_profiles TO service_role;
ALTER TABLE public.creator_voice_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator/agency manages voice profile"
  ON public.creator_voice_profiles FOR ALL USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));

-- =====================================================================
-- PERSONAS (dynamic; Real Me + AI kinds)
-- =====================================================================
CREATE TYPE public.persona_kind AS ENUM ('real_me', 'ai');
CREATE TYPE public.visibility AS ENUM ('draft', 'public', 'subscribers', 'vip', 'hidden');

CREATE TABLE public.personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  kind public.persona_kind NOT NULL,
  disclosure_label TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  tone_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  boundary_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_cents INTEGER NOT NULL DEFAULT 0,
  visibility public.visibility NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default_seed BOOLEAN NOT NULL DEFAULT false,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, slug)
);
-- one real_me per creator
CREATE UNIQUE INDEX personas_one_real_me_per_creator
  ON public.personas(creator_id) WHERE kind = 'real_me';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated;
GRANT SELECT ON public.personas TO anon;
GRANT ALL ON public.personas TO service_role;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views public personas"
  ON public.personas FOR SELECT USING (visibility IN ('public','subscribers','vip') OR public.can_manage_creator(creator_id));
CREATE POLICY "Creator/agency manages personas"
  ON public.personas FOR ALL USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));

-- Seed default personas whenever a creator row is inserted
CREATE OR REPLACE FUNCTION public.seed_default_personas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.personas (creator_id, slug, display_name, kind, disclosure_label, description, is_default_seed, sort_order, visibility) VALUES
    (NEW.id, 'real-me',    'Real Me',    'real_me', 'Real Me — Human creator/team', 'Real creator content and human-led interaction.', true, 0, 'draft'),
    (NEW.id, 'nice-ai',    'Nice AI',    'ai',      'Nice AI — Official AI persona', 'Soft, affectionate companion-style AI persona.', true, 1, 'draft'),
    (NEW.id, 'naughty-ai', 'Naughty AI', 'ai',      'Naughty AI — Official AI persona', 'Flirtier, playful, content-discovery AI persona.', true, 2, 'draft'),
    (NEW.id, 'wicked-ai',  'Wicked AI',  'ai',      'Wicked AI — Official AI persona', 'Premium fantasy AI persona with stricter controls.', true, 3, 'draft');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_creator_created_seed_personas
  AFTER INSERT ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_personas();

-- =====================================================================
-- CONTENT VAULT
-- =====================================================================
CREATE TYPE public.asset_type AS ENUM ('image','video','audio','text');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.consent_status AS ENUM ('n_a','on_file','missing');
CREATE TYPE public.moderation_status AS ENUM ('clean','flagged','removed');
CREATE TYPE public.permission_type AS ENUM ('included','ppv','restricted');

CREATE TABLE public.content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  asset_type public.asset_type NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  title TEXT NOT NULL,
  category TEXT,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  ai_generated_label BOOLEAN NOT NULL DEFAULT false,
  price_cents INTEGER NOT NULL DEFAULT 0,
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  consent_status public.consent_status NOT NULL DEFAULT 'n_a',
  moderation_status public.moderation_status NOT NULL DEFAULT 'clean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_assets TO authenticated;
GRANT ALL ON public.content_assets TO service_role;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator/agency manages assets"
  ON public.content_assets FOR ALL USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));
CREATE POLICY "Signed-in users can view approved assets"
  ON public.content_assets FOR SELECT USING (approval_status = 'approved' OR public.can_manage_creator(creator_id));

CREATE TABLE public.persona_content_permissions (
  persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  permission_type public.permission_type NOT NULL DEFAULT 'included',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (persona_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persona_content_permissions TO authenticated;
GRANT ALL ON public.persona_content_permissions TO service_role;
ALTER TABLE public.persona_content_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read persona-asset links"
  ON public.persona_content_permissions FOR SELECT USING (true);
CREATE POLICY "Creator/agency manages persona-asset links"
  ON public.persona_content_permissions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND public.can_manage_creator(p.creator_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND public.can_manage_creator(p.creator_id))
  );

-- =====================================================================
-- SUBSCRIPTIONS / TRANSACTIONS (placeholder)
-- =====================================================================
CREATE TYPE public.sub_tier AS ENUM ('free','base','plus','naughty','wicked','vip');
CREATE TYPE public.sub_status AS ENUM ('active','canceled','paused');
CREATE TYPE public.tx_kind AS ENUM ('sub','ppv','tip','credits');
CREATE TYPE public.tx_status AS ENUM ('stub','succeeded','failed');

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  tier public.sub_tier NOT NULL DEFAULT 'free',
  status public.sub_status NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fan_id, creator_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fan manages own subs"
  ON public.subscriptions FOR ALL USING (auth.uid() = fan_id) WITH CHECK (auth.uid() = fan_id);
CREATE POLICY "Creator sees own subs"
  ON public.subscriptions FOR SELECT USING (public.can_manage_creator(creator_id));

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  kind public.tx_kind NOT NULL,
  status public.tx_status NOT NULL DEFAULT 'stub',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fan reads own transactions"
  ON public.transactions FOR SELECT USING (auth.uid() = fan_id);
CREATE POLICY "Creator reads own transactions"
  ON public.transactions FOR SELECT USING (public.can_manage_creator(creator_id));
CREATE POLICY "Fan inserts own transactions"
  ON public.transactions FOR INSERT WITH CHECK (auth.uid() = fan_id);

-- =====================================================================
-- CHAT
-- =====================================================================
CREATE TYPE public.sender_type AS ENUM ('fan','ai','creator','system');

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fan_id, persona_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fan/creator/agency read own conversations"
  ON public.conversations FOR SELECT USING (auth.uid() = fan_id OR public.can_manage_creator(creator_id));
CREATE POLICY "Fan creates own conversations"
  ON public.conversations FOR INSERT WITH CHECK (auth.uid() = fan_id);
CREATE POLICY "Fan updates own conversations"
  ON public.conversations FOR UPDATE USING (auth.uid() = fan_id) WITH CHECK (auth.uid() = fan_id);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type public.sender_type NOT NULL,
  persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  moderation_status public.moderation_status NOT NULL DEFAULT 'clean',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read messages in own conversations"
  ON public.messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
            AND (c.fan_id = auth.uid() OR public.can_manage_creator(c.creator_id)))
  );
CREATE POLICY "Fan writes own messages"
  ON public.messages FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.fan_id = auth.uid())
  );

-- =====================================================================
-- SAFETY PLACEHOLDERS
-- =====================================================================
CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  document_url TEXT,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator/agency manages consent records"
  ON public.consent_records FOR ALL USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));
CREATE POLICY "Admins read all consent"
  ON public.consent_records FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.moderation_events TO authenticated;
GRANT ALL ON public.moderation_events TO service_role;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can report"
  ON public.moderation_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (reporter_id = auth.uid() OR reporter_id IS NULL));
CREATE POLICY "Reporter reads own reports"
  ON public.moderation_events FOR SELECT USING (reporter_id = auth.uid());
CREATE POLICY "Admins manage moderation"
  ON public.moderation_events FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.age_gate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'self_attest',
  passed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.age_gate_events TO authenticated;
GRANT ALL ON public.age_gate_events TO service_role;
ALTER TABLE public.age_gate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users write own age-gate events"
  ON public.age_gate_events FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users read own age-gate events"
  ON public.age_gate_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins read all age gate"
  ON public.age_gate_events FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.digital_twin_consent (
  creator_id UUID PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE,
  likeness_ok BOOLEAN NOT NULL DEFAULT false,
  voice_ok BOOLEAN NOT NULL DEFAULT false,
  image_ok BOOLEAN NOT NULL DEFAULT false,
  video_ok BOOLEAN NOT NULL DEFAULT false,
  allowed_uses JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_twin_consent TO authenticated;
GRANT ALL ON public.digital_twin_consent TO service_role;
ALTER TABLE public.digital_twin_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator/agency manages twin consent"
  ON public.digital_twin_consent FOR ALL USING (public.can_manage_creator(creator_id)) WITH CHECK (public.can_manage_creator(creator_id));
CREATE POLICY "Admins read twin consent"
  ON public.digital_twin_consent FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- =====================================================================
-- updated_at trigger utility
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_creators_updated BEFORE UPDATE ON public.creators FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_personas_updated BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_assets_updated  BEFORE UPDATE ON public.content_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
