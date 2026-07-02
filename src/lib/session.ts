import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useUserRoles(userId: string | undefined) {
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    if (!userId) { setRoles([]); return; }
    let mounted = true;
    supabase.from("user_roles").select("role").eq("user_id", userId).then(({ data }) => {
      if (mounted && data) setRoles(data.map((r) => r.role));
    });
    return () => { mounted = false; };
  }, [userId]);
  return roles;
}

export type { User };