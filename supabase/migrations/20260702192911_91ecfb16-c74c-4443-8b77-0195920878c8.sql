
-- Enums via check constraints for simplicity
CREATE TABLE public.content_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  pack_type TEXT NOT NULL DEFAULT 'custom' CHECK (pack_type IN ('nice','naughty','wicked','seasonal','custom')),
  description TEXT,
  cover_asset_id UUID REFERENCES public.content_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected','archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_packs_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT content_packs_slug_fmt CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  UNIQUE (creator_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_packs TO authenticated;
GRANT ALL ON public.content_packs TO service_role;

ALTER TABLE public.content_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read own packs"
  ON public.content_packs FOR SELECT TO authenticated
  USING (public.can_manage_creator(creator_id));

CREATE POLICY "Managers can insert own packs"
  ON public.content_packs FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Managers can update own packs"
  ON public.content_packs FOR UPDATE TO authenticated
  USING (public.can_manage_creator(creator_id))
  WITH CHECK (public.can_manage_creator(creator_id));

CREATE POLICY "Managers can delete own packs"
  ON public.content_packs FOR DELETE TO authenticated
  USING (public.can_manage_creator(creator_id));

CREATE TRIGGER content_packs_set_updated_at
  BEFORE UPDATE ON public.content_packs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX content_packs_creator_idx ON public.content_packs(creator_id, sort_order);

-- ============ content_pack_items ============
CREATE TABLE public.content_pack_items (
  pack_id UUID NOT NULL REFERENCES public.content_packs(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.content_assets(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, asset_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pack_items TO authenticated;
GRANT ALL ON public.content_pack_items TO service_role;

ALTER TABLE public.content_pack_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read own pack items"
  ON public.content_pack_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can insert own pack items"
  ON public.content_pack_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can update own pack items"
  ON public.content_pack_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can delete own pack items"
  ON public.content_pack_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE INDEX content_pack_items_pack_idx ON public.content_pack_items(pack_id, position);
CREATE INDEX content_pack_items_asset_idx ON public.content_pack_items(asset_id);

-- ============ content_pack_personas ============
CREATE TABLE public.content_pack_personas (
  pack_id UUID NOT NULL REFERENCES public.content_packs(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  permission_type TEXT NOT NULL DEFAULT 'included' CHECK (permission_type IN ('included','ppv','restricted')),
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, persona_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pack_personas TO authenticated;
GRANT ALL ON public.content_pack_personas TO service_role;

ALTER TABLE public.content_pack_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read own pack personas"
  ON public.content_pack_personas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can insert own pack personas"
  ON public.content_pack_personas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can update own pack personas"
  ON public.content_pack_personas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE POLICY "Managers can delete own pack personas"
  ON public.content_pack_personas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_packs p WHERE p.id = pack_id AND public.can_manage_creator(p.creator_id)));

CREATE INDEX content_pack_personas_persona_idx ON public.content_pack_personas(persona_id);

-- ============ Seed default packs on new creator ============
CREATE OR REPLACE FUNCTION public.seed_default_packs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.content_packs (creator_id, name, slug, pack_type, description, sort_order) VALUES
    (NEW.id, 'Nice Pack',    'nice-pack',    'nice',    'Soft, approachable content.', 0),
    (NEW.id, 'Naughty Pack', 'naughty-pack', 'naughty', 'Flirtier, playful content.',   1),
    (NEW.id, 'Wicked Pack',  'wicked-pack',  'wicked',  'Premium, adults-only fantasy.', 2)
  ON CONFLICT (creator_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS creators_seed_default_packs ON public.creators;
CREATE TRIGGER creators_seed_default_packs
  AFTER INSERT ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_packs();

-- Backfill for existing creators
INSERT INTO public.content_packs (creator_id, name, slug, pack_type, description, sort_order)
SELECT c.id, v.name, v.slug, v.pack_type, v.description, v.sort_order
FROM public.creators c
CROSS JOIN (VALUES
  ('Nice Pack',    'nice-pack',    'nice',    'Soft, approachable content.', 0),
  ('Naughty Pack', 'naughty-pack', 'naughty', 'Flirtier, playful content.',   1),
  ('Wicked Pack',  'wicked-pack',  'wicked',  'Premium, adults-only fantasy.', 2)
) AS v(name, slug, pack_type, description, sort_order)
ON CONFLICT (creator_id, slug) DO NOTHING;
