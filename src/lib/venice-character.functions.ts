import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LookupVeniceCharacterResult =
  | { found: true; character: { slug: string; name: string; description: string | null; photoUrl: string | null; author: string; adult: boolean } }
  | { found: false }
  | { error: true; message: string };

/**
 * Auth-gated preview lookup for the "quick-start from a Venice Character"
 * field in persona creation — lets a creator confirm a pasted slug is real
 * and see who/what it actually is before saving it, rather than storing an
 * opaque unchecked string (unlike heygen_avatar_id/heygen_voice_id, this
 * lookup is possible because Venice actually publishes a GET /characters/{slug}
 * endpoint for it). Venice Characters are public entities, so this doesn't
 * need to scope to the caller's own creator_id — any authenticated user can
 * look one up, same as browsing Venice's own public character gallery.
 */
export const lookupVeniceCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<LookupVeniceCharacterResult> => {
    const slug = data.slug.trim();
    if (!slug) throw new Error("Enter a Venice Character slug first.");

    try {
      const { getVeniceCharacter } = await import("./venice.server");
      const character = await getVeniceCharacter(slug);
      if (!character) return { found: false };
      return {
        found: true,
        character: {
          slug: character.slug,
          name: character.name,
          description: character.description,
          photoUrl: character.photoUrl,
          author: character.author,
          adult: character.adult,
        },
      };
    } catch (e: any) {
      // Transport / upstream failure — return as a soft error so the UI can
      // distinguish "no such character" from "Venice is unreachable" and
      // offer a retry / manual-JSON fallback.
      return { error: true, message: e?.message ?? "Venice lookup failed" };
    }
  });

export type VeniceCharacterSearchSummary = {
  slug: string; name: string; description: string | null; photoUrl: string | null;
  author: string; adult: boolean; tags: string[]; averageRating: number; imports: number;
};

export type SearchVeniceCharactersResult =
  | { results: VeniceCharacterSearchSummary[] }
  | { error: true; message: string };

/**
 * Auth-gated browse/search for the "find your Venice Character" step in
 * twin onboarding — lets a creator locate their own published character by
 * name/tag rather than needing to already know its exact slug (which the
 * single-slug lookupVeniceCharacter above requires). Same public-entity
 * reasoning as lookupVeniceCharacter: no creator_id scoping needed.
 */
export const searchVeniceCharacters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { query?: string; isAdult?: boolean }) => d)
  .handler(async ({ data }): Promise<SearchVeniceCharactersResult> => {
    const query = data.query?.trim();
    if (!query) return { results: [] };
    try {
      const { searchVeniceCharacters: search } = await import("./venice.server");
      const results = await search({ search: query, isAdult: data.isAdult, limit: 20 });
      return {
        results: results.map((c) => ({
          slug: c.slug, name: c.name, description: c.description, photoUrl: c.photoUrl,
          author: c.author, adult: c.adult, tags: c.tags, averageRating: c.averageRating, imports: c.imports,
        })),
      };
    } catch (e: any) {
      return { error: true, message: e?.message ?? "Venice search failed" };
    }
  });

/**
 * Read the creator-level "baseline" Venice Character ID — imported once
 * from the Twin/Baseline model page and inherited as the default by new
 * personas, so creators don't have to paste it into every persona.
 */
export const getBaselineVeniceCharacter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("creators")
      .select("venice_character_slug")
      .eq("user_id", userId)
      .maybeSingle();
    return { slug: ((data as any)?.venice_character_slug as string | null) ?? null };
  });

export const setBaselineVeniceCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { slug: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const v = (data.slug ?? "").trim();
    const value = v ? v.slice(0, 120) : null;
    const { error } = await supabase
      .from("creators")
      .update({ venice_character_slug: value } as any)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true, slug: value };
  });

/**
 * Validation-driven read for the dashboard checklist: returns the saved slug
 * AND a live Venice lookup so the UI can render "verified: <name>", "no
 * longer resolves", or "verification unavailable" without a second round-trip.
 */
export const getBaselineVeniceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    slug: string | null;
    status: "empty" | "verified" | "not_found" | "unavailable";
    characterName?: string;
    message?: string;
  }> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("creators")
      .select("venice_character_slug")
      .eq("user_id", userId)
      .maybeSingle();
    const slug = ((data as any)?.venice_character_slug as string | null) ?? null;
    if (!slug) return { slug: null, status: "empty" };
    try {
      const { getVeniceCharacter } = await import("./venice.server");
      const character = await getVeniceCharacter(slug);
      if (!character) return { slug, status: "not_found", message: "The saved ID no longer resolves on Venice." };
      return { slug, status: "verified", characterName: character.name };
    } catch (e: any) {
      return { slug, status: "unavailable", message: e?.message ?? "Venice lookup failed" };
    }
  });
