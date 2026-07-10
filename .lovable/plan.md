## Goal
Let each creator set their own prices for Base / Plus / VIP tiers, and let fans subscribe to a specific creator at that creator's price via embedded Stripe checkout.

## Data model

New table `public.creator_tier_prices`:
- `creator_id`, `tier` (base|plus|vip), `amount_cents`, `currency` (default `usd`), `active`
- Unique per (creator, tier)
- RLS: creators manage own rows (via `can_manage_creator`), `anon` + `authenticated` read active rows

Existing `subscriptions` table already has `fan_id`, `creator_id`, `tier`, `status`, `current_period_end`, `provider_ref` — reuse it. Add columns: `stripe_subscription_id`, `stripe_customer_id`, `environment` (sandbox|live), `cancel_at_period_end`, `amount_cents`, `currency`.

## Server-side

`src/lib/stripe.server.ts` — shared gateway-routed Stripe client + `verifyWebhook` + `getStripeErrorMessage` (per knowledge, verbatim).

`src/lib/creator-pricing.functions.ts`:
- `getCreatorPricing({creatorId})` — public read of active prices
- `upsertCreatorPrice({tier, amountCents})` — creator only (RLS)
- `deactivateCreatorPrice({tier})` — creator only

`src/lib/checkout.functions.ts`:
- `createCreatorSubscriptionCheckout({creatorId, tier, returnUrl, environment})` — auth-required
  - Loads active price for (creator, tier)
  - Resolves/creates Stripe Customer with `metadata.userId`
  - Creates embedded Checkout session with dynamic `price_data` (recurring monthly), `subscription_data.metadata` = `{userId, creatorId, tier}`, `automatic_tax: { enabled: true }` (adult content → tax calc only, not full compliance)
  - Returns `clientSecret`
- `createBillingPortal({returnUrl, environment})` — auth-required, returns portal URL for the user's Stripe customer

`src/routes/api/public/payments/webhook.ts` — verifies signature, handles `customer.subscription.{created,updated,deleted}`; upserts into `subscriptions` keyed off `stripe_subscription_id`, reads `creatorId`/`tier`/`userId` from subscription metadata.

## Client-side / UI

`src/lib/stripe.ts` — `getStripe()` + `getStripeEnvironment()` derived from `VITE_PAYMENTS_CLIENT_TOKEN` prefix.

`src/components/twinly/PaymentTestModeBanner.tsx` — mount at `__root.tsx`.

`src/components/twinly/CreatorSubscribeButtons.tsx` — reads creator's active prices, shows tier cards (Base / Plus / VIP with amount + name), opens embedded checkout in a dialog. Signed-out users see the existing `AuthPromptDialog`. If a fan already has an active subscription to that creator+tier, show "Subscribed · Manage" that opens the billing portal.

Wire it into `src/routes/creators.$handle.tsx` — new "Subscribe" section above / near the profile pills.

`src/routes/checkout.return.tsx` — post-checkout landing that shows success + link back to creator or `/account/subscriptions`.

## Creator pricing management

`src/routes/studio.pricing.tsx` — creator studio page with a form for each tier: enable/disable + price input (USD, cents), warns 18+ tiers about extra visibility rules. Add nav link in the studio.

## Account hub integration

Update `src/routes/account.subscriptions.tsx` list rendering:
- Show tier + creator + monthly amount + renewal date
- Replace inline "Cancel" with "Manage in billing portal" that calls `createBillingPortal`

Add "Billing portal" link in the hamburger menu when the user has any subscription.

## Tax handling

Adult creator platform → Stripe full compliance handling not available. Use `automatic_tax: { enabled: true }` (Stripe calculates & collects, you handle registration/filing). Assign tax code `txcd_10000000` (general digital goods) to any shared product-level records if we create them.

## Out of scope for this pass

- One-time content unlocks (pay-per-post)
- Tips
- Refund UI
- Multiple currencies (USD only)
- Coupons / promo codes

We can add any of these after the base flow is solid.

## Technical notes

- Uses dynamic `price_data` with `recurring: { interval: "month" }` per checkout — no per-creator Stripe Price object needed, so no admin work when a creator changes their price.
- Uses `product_data.name` = `"{Creator stage_name} — {Tier}"` for readable dashboards / customer receipts.
- Follows the "resolveOrCreateCustomer" pattern so lookups by userId work later.
- Adds `stripe@22.0.2`, `@stripe/stripe-js@9.2.0`, `@stripe/react-stripe-js@6.2.0`.
