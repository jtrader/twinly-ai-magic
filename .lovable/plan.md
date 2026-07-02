
# Twinly.ai — MVP Implementation Plan

Mobile-first PWA where verified creators launch official AI personas (Real Me + unlimited AI personas), sell content, and manage fans. This plan is scoped to a functional, safe **placeholder MVP**: real chat scaffolding, dynamic persona system, dashboards, and role-based access — with clearly-marked stubs for KYC, payments, moderation vendors, and generative media. No explicit content, no real payment flows, no real ID checks.

---

## 1. Questions I need answered before building

1. **Auth methods**: Default to Lovable Cloud email/password + Google. OK, or email-only for MVP?
2. **Age gate style**: Simple self-attestation modal (blueprint says this is *insufficient* for production, but fine as a placeholder) — confirm this is acceptable for MVP.
3. **LLM in MVP**: Wire the chat to Lovable AI Gateway (Gemini) with placeholder persona system prompts now, or ship fully stubbed replies until Phase 2?
4. **Content vault media**: Real uploads to Lovable Cloud storage (images/video, non-explicit placeholders only), or metadata-only records?
5. **Currency & pricing display**: USD only for MVP?
6. **Agency model**: One agency owns many creators, and a creator can belong to at most one agency — confirm.
7. **Brand/design**: Dark premium (deep navy + electric indigo, Space Grotesk + DM Sans) already selected — confirm.

I'll assume: Cloud email + Google, self-attest 18+ gate, Lovable AI wired with per-persona system prompt, real image uploads (SFW placeholders), USD, single-agency-per-creator, dark premium brand. Flag any changes.

---

## 2. Phased roadmap

**Phase 0 — Foundation (this MVP)**
Auth, roles, dynamic personas, content vault, fan chat with AI disclosure, creator & admin dashboards, all safety/payment surfaces as placeholders.

**Phase 1 — Real integrations (post-MVP)**
KYC/age-assurance vendor, Stripe/CCBill, moderation vendor, richer RAG per persona.

**Phase 2 — Digital Twin beta**
Consent flow → source vault → avatar/voice/image generation → creator approval → labeled synthetic content.

**Phase 3 — Agency & marketplace scale**
Multi-creator agency dashboards, permissions matrix, revenue splits, affiliate/referral, compliance exports.

---

## 3. Data model (Lovable Cloud / Postgres)

Every table below has RLS on and grants set for `authenticated` / `service_role`. Roles use the standard `user_roles` + `has_role()` pattern.

**Identity & roles**
- `profiles` (id=auth.users, display_name, avatar_url, dob_attested_at, country, created_at)
- `app_role` enum: `fan | creator | agency | admin`
- `user_roles` (user_id, role) — canonical role table
- `agencies` (id, name, owner_user_id)
- `agency_creators` (agency_id, creator_id, permissions jsonb) — many-to-many

**Creator**
- `creators` (id, user_id UNIQUE, stage_name, bio, avatar_url, cover_url, verification_status enum `unverified|pending|verified|rejected`, payout_status, digital_twin_status enum `none|pending|approved|revoked`, agency_id nullable)
- `creator_voice_profiles` (creator_id UNIQUE, tone_summary, vocabulary_rules jsonb, boundary_rules jsonb, sales_style, banned_phrases text[], approved_phrases text[])

**Dynamic personas (core)**
- `personas` (id, creator_id, **slug**, **display_name**, kind enum `real_me|ai`, disclosure_label, system_prompt, tone_rules jsonb, boundary_rules jsonb, price_cents, visibility enum `draft|public|subscribers|vip|hidden`, starts_at, ends_at, sort_order, is_default_seed bool, created_at)
  - `real_me` is a persona row with `kind='real_me'` per creator; enforced by partial unique index.
  - Seed defaults on creator signup: **Real Me, Nice AI, Naughty AI, Wicked AI** (rows, not enum values).
  - Custom persona names ("XNurse", "After Dark", etc.) are just rows — fully user-defined.

**Content**
- `content_assets` (id, creator_id, asset_type enum `image|video|audio|text`, storage_path, title, category, is_synthetic bool, ai_generated_label bool, price_cents, approval_status enum `pending|approved|rejected`, consent_status enum `n/a|on_file|missing`, moderation_status, created_at)
- `persona_content_permissions` (persona_id, asset_id, permission_type enum `included|ppv|restricted`) — assigns assets to personas

**Fan relationships & commerce (placeholder)**
- `subscriptions` (id, fan_id, creator_id, tier enum `free|base|plus|naughty|wicked|vip`, status enum `active|canceled|paused`, provider_ref, current_period_end) — no real billing
- `persona_access` (fan_id, persona_id, source enum `subscription|ppv|comp`, expires_at) — computed view + explicit unlocks
- `transactions` (id, fan_id, creator_id, persona_id nullable, asset_id nullable, amount_cents, kind enum `sub|ppv|tip|credits`, status enum `stub|succeeded|failed`) — stub only
- `fan_creator_relationships` (fan_id, creator_id, lifetime_spend_cents, tags text[], preferences jsonb)

**Chat**
- `conversations` (id, fan_id, creator_id, persona_id, started_at, last_message_at)
- `messages` (id, conversation_id, sender_type enum `fan|ai|creator|system`, persona_id nullable, body, ai_generated bool, moderation_status, created_at)

**Safety & compliance (placeholder tables so UI compiles)**
- `consent_records` (id, creator_id, asset_id, kind, document_url, valid_from, valid_until, revoked_at)
- `moderation_events` (id, target_type, target_id, reporter_id, category, severity, status, resolution, created_at)
- `age_gate_events` (user_id, method, passed_at) — self-attest for MVP
- `digital_twin_consent` (creator_id, likeness_ok, voice_ok, image_ok, video_ok, allowed_uses jsonb, signed_at, revoked_at)

**Grants + RLS pattern** (applied to every public table):
- Fan reads own rows + public creator/persona/asset rows filtered by visibility & subscription
- Creator full CRUD on rows scoped by `creator_id = current creator`
- Agency read/write on creators they manage (via `agency_creators`)
- Admin via `has_role(auth.uid(), 'admin')`

---

## 4. Route / page list (TanStack Start, `src/routes/`)

Public
- `/` — landing (already directional), tagline, verified/AI messaging, CTA to sign up / explore creators
- `/discover` — creator directory (placeholder cards)
- `/creators/$handle` — public creator profile (bio, personas visible to guest, subscribe CTA, age gate modal on entry)
- `/legal/terms`, `/legal/privacy`, `/legal/ai-disclosure`, `/legal/2257-placeholder`
- `/auth` — sign in / sign up (Cloud managed)
- `/waitlist/creator`, `/waitlist/fan` — for Phase-1 validation collection

Authenticated (under `_authenticated/`)
- `/app` — role-aware home redirect
- **Fan**
  - `/creators/$handle/personas` — persona selector (Real Me + AI grid with disclosure labels)
  - `/chat/$conversationId` — chat UI with sticky AI-disclosure banner
  - `/vault/$handle` — subscribed content feed, PPV unlocks
  - `/account`, `/account/subscriptions`, `/account/preferences`
- **Creator** (`/creator/*`)
  - `/creator/onboarding` — 6-step wizard (identity → voice profile → training uploads → generate Voice Bible → generate personas → approve)
  - `/creator/dashboard` — revenue, fans, persona performance (placeholder charts)
  - `/creator/personas` — list + create custom personas (name, tone, pricing, visibility, dates, content access)
  - `/creator/personas/$id` — edit tone rules, boundaries, system prompt, content library assignment, lifecycle dates
  - `/creator/vault` — content vault, upload, tag, assign to personas
  - `/creator/chats` — inbox + human takeover
  - `/creator/twin` — digital twin consent flow (placeholder)
  - `/creator/compliance`, `/creator/payouts` (placeholders)
- **Agency** (`/agency/*`)
  - `/agency/dashboard`, `/agency/creators`, `/agency/creators/$id` (acts-as controls)
- **Admin** (`/admin/*`)
  - `/admin` — queues overview
  - `/admin/verifications`, `/admin/moderation`, `/admin/reports`, `/admin/users`, `/admin/personas` (uniqueness & safety audit), `/admin/synthetic-audit`

---

## 5. Component list (reusable)

- `AgeGateDialog` — one-time attest per session/device
- `AiDisclosureBanner` — sticky banner in every AI chat + card badge on persona tiles
- `PersonaCard`, `PersonaGrid`, `PersonaBadge` (Real Me vs AI)
- `PersonaEditorForm` (tone, boundaries, pricing, visibility, dates, content picker)
- `ContentAssetCard`, `AssetUploader`, `PersonaAssetAssigner`
- `ChatShell` (AI Elements: Conversation, Message, MessageResponse, PromptInput, Shimmer) with disclosure banner slot
- `CreatorProfileHeader`, `SubscribeCTA`, `TierBadge`
- `VerificationStatusPill`, `TwinConsentStatusPill`
- `RoleGuard` (client-side conditional rendering; real gate is `_authenticated` + RLS)
- `DashboardStatCard`, `PlaceholderChart`
- `OnboardingStepper` + step forms
- `ModerationQueueRow`, `ReportButton`, `ReportDialog`
- `PaymentPlaceholderModal` ("Payments coming soon" for all $ actions)

---

## 6. User flows

**Fan**
Landing → sign up (fan) → age-gate self-attest → discover → creator profile → subscribe (placeholder) → persona selector (Real Me / Nice / Naughty / Wicked / custom) → AI disclosure confirm → chat.

**Creator**
Sign up (creator) → verification placeholder → 6-step onboarding → seed 4 default personas + Real Me → edit/create custom personas → upload vault content → assign assets to personas → publish → dashboard.

**Agency**
Sign up (agency) → invite/link creator → act-as creator with scoped permissions.

**Admin**
Sign in with admin role (seeded) → queues → approve verification / moderation / synthetic audit.

---

## 7. Role permissions matrix (summary)

| Action | Fan | Creator | Agency | Admin |
|---|---|---|---|---|
| Browse public profiles | ✅ | ✅ | ✅ | ✅ |
| Subscribe / chat | ✅ | — | — | audit |
| Create/edit own personas | — | ✅ | ✅ (linked) | ✅ |
| Upload/assign vault content | — | ✅ | ✅ (linked) | ✅ |
| Human takeover chat | — | ✅ | ✅ | — |
| Approve verifications | — | — | — | ✅ |
| Moderation & takedowns | report | report | report | ✅ |

---

## 8. Risk areas (called out for compliance later)

1. **Age assurance** — self-attest is *not sufficient* per Australian eSafety / EU rules. Must swap in a real provider before public launch.
2. **AI disclosure** — must be in UI, not TOS; already core to design.
3. **Consent records for real people in content** — schema stubbed; workflow needed pre-launch.
4. **Payment risk** — adult platforms need Mastercard/Visa-compliant processors (CCBill, Segpay). Do not wire Stripe naively.
5. **Persona uniqueness / anti-impersonation** — admin audit page + `is_default_seed` flag now; scoring algorithm later.
6. **Synthetic media provenance** — `is_synthetic` + `ai_generated_label` columns enforced; watermarking added in Phase 2.
7. **Data isolation between creators** — RLS scoped by `creator_id`; no cross-creator training leakage.
8. **RTF blueprint mentions minors safety** — hard-block content categories at DB enum level.

---

## 9. Now vs later

**Build now (MVP):**
Auth + roles, dynamic personas w/ seeding, content vault + persona assignment, fan chat UI with AI disclosure, creator/admin/agency dashboards (placeholder metrics), self-attest age gate, placeholder subscription/PPV modals, digital-twin consent form (records only), report/moderation queue (records only), PWA manifest + install prompt.

**Later:**
Real KYC/age vendor, real payments, RAG + vector store per persona, avatar/voice/image/video generation, human-in-the-loop chat routing, jurisdiction rules engine, takedown workflow, revenue splits, chargeback dashboards, native app wrappers.

---

## 10. Lovable implementation prompt sequence

Run these as separate turns after plan approval:

1. **Enable Lovable Cloud** and configure email + Google auth.
2. **Design system + PWA shell**: dark theme tokens (deep navy `#0a0a1a` bg, electric indigo `#4f46e5` primary in oklch), Space Grotesk + DM Sans via `@fontsource`, base layout, mobile nav, PWA manifest + icons (manifest-only, no service worker per Lovable defaults).
3. **Schema migration #1 — identity & roles**: `app_role` enum, `user_roles`, `has_role()`, `profiles`, `agencies`, `agency_creators`. Grants + RLS.
4. **Schema migration #2 — creators & personas**: `creators`, `creator_voice_profiles`, `personas`, seed trigger on creator insert to add Real Me + Nice AI + Naughty AI + Wicked AI as *rows*.
5. **Schema migration #3 — content & permissions**: `content_assets`, `persona_content_permissions`, storage bucket for vault, signed-URL access.
6. **Schema migration #4 — chat, commerce, safety placeholders**: `conversations`, `messages`, `subscriptions`, `persona_access`, `transactions`, `consent_records`, `moderation_events`, `age_gate_events`, `digital_twin_consent`.
7. **Public site**: landing, discover, `/creators/$handle`, legal pages, waitlist forms, age-gate modal.
8. **Auth + role-aware `/app` redirect** and `_authenticated` layout.
9. **Fan flow**: profile → persona selector → AI disclosure confirm → chat (AI Elements + Lovable AI Gateway with per-persona system prompt) → vault feed → placeholder subscribe modal.
10. **Creator onboarding wizard** (6 steps) + auto-seed personas on completion.
11. **Creator dashboard + persona CRUD** (custom names, tone, pricing, visibility, start/end dates, content picker).
12. **Creator vault** (upload, tag, assign to personas, chat inbox with takeover button).
13. **Agency dashboard** + acts-as-creator.
14. **Admin dashboard**: verification queue, moderation queue, reports, users, synthetic audit — all reading placeholder rows.
15. **Digital twin consent flow** (form + record only).
16. **QA pass**: RLS smoke tests, mobile viewport check, AI disclosure present on every AI persona surface, no explicit copy, seeded admin user documented.

---

Ready to implement on approval. Answer the 7 questions in section 1 (or say "use defaults") and I'll start with step 1.
