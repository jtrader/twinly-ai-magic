const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) return null;
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center text-[11px] text-amber-100">
        Test mode — no real charges. Use card <span className="font-mono">4242 4242 4242 4242</span>.
      </div>
    );
  }
  return null;
}