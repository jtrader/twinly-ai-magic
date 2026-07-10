
## What's already there (keep as-is)
- Per-creator subscriptions (Base / Plus / VIP) via dynamic `price_data` + embedded Checkout.
- Stripe Billing Portal for saved cards & self-serve cancel.
- Webhook at `/api/public/payments/webhook` writing `subscriptions` table.

## Card storage
Stripe stores card details — we never touch PANs. Once a fan pays, the card lives on their Stripe Customer (identified by `metadata.userId`) and is reused for renewals and one-tap PPV / tips. Fans manage saved cards through the Billing Portal already wired in `AccountMenu`.

---

## 1. Twinly+ platform membership
Real Stripe **catalog** products (not dynamic pricing) so the go-live sync copies them to live.

Products (via `payments--batch_create_product`, tax code `txcd_10000000` — general digital goods, eligible for full compliance handling):
- `twinly_plus` → `twinly_plus_monthly` $9.99/mo, `twinly_plus_yearly` $99/yr

Perks (enforced server-side):
- Ad-free (placeholder flag).
- 10% discount on all creator tips (webhook applies).
- "Twinly+" badge next to display name.

New surfaces:
- `/pricing` — plan cards, embedded Checkout dialog.
- `AccountMenu` → "Twinly+" link.
- `useTwinlyPlus()` hook reads `subscriptions` filtered by `price_id IN ('twinly_plus_monthly','twinly_plus_yearly')` and `environment`.

## 2. One-time content unlocks (PPV)
Table `content_unlocks (user_id, unlockable_type, unlockable_id, amount_cents, stripe_payment_intent_id, environment, created_at)` — auth reads own, service_role writes.

Server fn `createUnlockCheckout({ unlockableType: 'post'|'pack', unlockableId, environment })` — resolves creator + price from `creator_posts.unlock_price_cents` / `content_packs.unlock_price_cents` (new columns), embedded Checkout with dynamic `price_data`, `mode: 'payment'`, `payment_intent_data.description = "<Creator> — <Title>"`, metadata `{ userId, unlockableType, unlockableId, creatorId }`.

Webhook handles `checkout.session.completed` for `mode:'payment'` → insert `content_unlocks` row.

`PaywallModal.tsx` (exists) — swap placeholder for real embedded Checkout; `useHasUnlock(type,id)` hook gates content.

## 3. Tips / pay-what-you-want
`TipButton` on `creators.$handle.tsx`. Amount picker ($3/$5/$10/custom, min $1). Server fn `createTipCheckout({ creatorId, amountCents })` — dynamic `price_data`, tax code inferred as digital service. Applies −10% for Twinly+ members (checked server-side from `subscriptions`).

`transactions` table already exists — reuse it to log tip receipts on webhook.

## 4. Business-logic wiring (webhook side)
Extend `/api/public/payments/webhook`:

| Event | Action |
|---|---|
| `customer.subscription.created` (per-creator) | Upsert `subscriptions`; **auto-follow** via `creator_follows` upsert; **notify fan** ("You're subscribed to <creator> — <tier>"); **notify creator** ("<fan> just subscribed to <tier>"). |
| `customer.subscription.created` (Twinly+) | Same but no auto-follow / creator notify; fan gets "Twinly+ active" notification. |
| `customer.subscription.updated` (tier change) | Update row; if tier changed, notify fan + creator; `isActive` still driven by `status`/`current_period_end`. |
| `customer.subscription.deleted` OR `cancel_at_period_end=true` | Keep `status='active'` until `current_period_end` (no immediate revoke — matches user's answer); mark `cancel_at_period_end`; notify fan of end-date. |
| `checkout.session.completed` with `mode:'payment'` + `unlockableType` | Insert `content_unlocks`; notify fan. |
| `checkout.session.completed` with `mode:'payment'` + tip metadata | Insert `transactions`; notify creator with amount. |

Access check helper `hasActiveSubscription(userId, creatorId, tier)` — considers `status IN ('active','trialing') OR (status='canceled' AND current_period_end > now())`. This is the "keep access until end of period" rule you picked.

## 5. Upgrade with proration (Plus → VIP)
New server fn `changeSubscriptionTier({ subscriptionId, newTier, environment })` — auth-required. Loads current sub, resolves new tier's price, calls `stripe.subscriptions.update(id, { items: [{ id: itemId, price_data: {...} }], proration_behavior: 'always_invoice' })` — Stripe charges the difference immediately and access flips right away.

UI: `CreatorSubscribeButtons` shows current tier with "Change plan" — clicking a higher tier calls upgrade fn (confirm dialog with prorated amount preview from `stripe.invoices.retrieveUpcoming`); a lower tier routes to the Billing Portal.

## 6. Polish existing subs
- Prevent duplicate subscribe: subscribe buttons disabled + labeled "Current plan" when active row exists for that creator.
- Saved-card indicator on Checkout dialog ("Using card ending in •••• 4242" if Stripe returns `payment_method`).
- `PaymentTestModeBanner` already in place — no change.
- `subscriptions` list on `/account/subscriptions` gets: cancel-scheduled banner ("Ends <date>") + "Reactivate" button when `cancel_at_period_end`.

---

## Files touched
- `payments--batch_create_product` — `twinly_plus` monthly + yearly.
- Migration — `content_unlocks` table; `creator_posts.unlock_price_cents`, `content_packs.unlock_price_cents`; `has_creator_access(user_id, creator_id, tier)` SQL fn.
- `src/lib/checkout.functions.ts` — add `createTwinlyPlusCheckout`, `createUnlockCheckout`, `createTipCheckout`, `changeSubscriptionTier`, `previewUpgradeInvoice`.
- `src/routes/api/public/payments/webhook.ts` — extend event handlers per table above.
- `src/routes/pricing.tsx` — new.
- `src/lib/twinly-plus.ts` — hook + server fn.
- `src/lib/unlocks.functions.ts` — `getMyUnlocks`, `hasUnlock`.
- `src/lib/tips.functions.ts` — checkout + list-received.
- `src/components/twinly/TipButton.tsx` — new.
- `src/components/twinly/CreatorSubscribeButtons.tsx` — current-plan / change-plan / reactivate states.
- `src/components/twinly/PaywallModal.tsx` — real embedded Checkout.
- `src/routes/account.subscriptions.tsx` — cancel-scheduled banner + reactivate.
- `src/routes/account.unlocks.tsx` — new list.
- `src/components/twinly/AppShell.tsx` — Twinly+ menu link.

## Out of scope (ask separately)
- Multi-currency, coupons/promo codes, gift subscriptions, refund UI, chargeback tooling, invoice PDF branding.

## Execution order (I'll ship in this order)
1. Create Twinly+ Stripe product + migration (`content_unlocks`, unlock price columns, `has_creator_access` fn).
2. Extend webhook (auto-follow, notifications, unlocks, tips, cancel-at-period-end semantics).
3. `changeSubscriptionTier` + upgrade UI on subscribe buttons.
4. `/pricing` page + Twinly+ checkout.
5. PPV: `PaywallModal` real checkout + `content_unlocks` reads + `/account/unlocks`.
6. Tips: `TipButton` on creator profile + receipts.
7. Polish: current-plan state, cancel-scheduled banner, reactivate.
