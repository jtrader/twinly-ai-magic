/**
 * Ad-hoc rate limiter backed by public.check_rate_limit RPC.
 * Returns true when the caller is under the limit, false otherwise.
 */
export async function checkRateLimit(
  supabase: any,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    _bucket: bucket,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[twinly] rate limit RPC failed:", error);
    return true; // fail-open to avoid locking users out on infra hiccups
  }
  return Boolean(data);
}