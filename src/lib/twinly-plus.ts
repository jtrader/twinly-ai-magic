import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";

export type TwinlyPlusStatus = {
  hasPlus: boolean;
  loading: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  priceId: string | null;
};

export function useTwinlyPlus(): TwinlyPlusStatus {
  const { user } = useSession();
  const [state, setState] = useState<TwinlyPlusStatus>({
    hasPlus: false, loading: true, cancelAtPeriodEnd: false, currentPeriodEnd: null, priceId: null,
  });

  useEffect(() => {
    if (!user || !isPaymentsConfigured()) {
      setState({ hasPlus: false, loading: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, priceId: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const env = getStripeEnvironment();
      const { data } = await supabase
        .from("platform_subscriptions")
        .select("status, cancel_at_period_end, current_period_end, price_id")
        .eq("user_id", user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = data as any;
      const end = row?.current_period_end ? new Date(row.current_period_end) : null;
      const valid = !end || end > new Date();
      const hasPlus = !!row && ((row.status === "active" && valid) || (row.status === "canceled" && end && end > new Date()));
      setState({
        hasPlus,
        loading: false,
        cancelAtPeriodEnd: !!row?.cancel_at_period_end,
        currentPeriodEnd: row?.current_period_end ?? null,
        priceId: row?.price_id ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}