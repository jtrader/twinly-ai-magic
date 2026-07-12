import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LookupVeniceCharacterResult =
  | { found: true; character: { slug: string; name: string; description: string | null; photoUrl: string | null; author: string; adult: boolean } }
  | { found: false };

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
  });
