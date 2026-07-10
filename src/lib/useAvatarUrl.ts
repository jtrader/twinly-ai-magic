import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stored avatar reference into a displayable URL.
 * - Full http(s) URLs pass through.
 * - Anything else is treated as a storage path in the private `avatars` bucket
 *   and turned into a short-lived signed URL.
 */
export function useAvatarUrl(pathOrUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pathOrUrl) { setUrl(null); return; }
    if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:")) {
      setUrl(pathOrUrl);
      return;
    }
    supabase.storage.from("avatars").createSignedUrl(pathOrUrl, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [pathOrUrl]);

  return url;
}