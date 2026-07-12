# Provider data-handling record

Living reference for what happens to chat/generation data at each LLM provider
this app calls. Reviewed on provider/plan change and on the schedule tracked
in the `provider_data_handling_records` table (see `admin.tsx` → Provider data
handling). This file is the human-readable mirror of that table — update both
together.

## Lovable AI Gateway (`google/gemini-2.5-flash`)

Used for: non-explicit chat replies (`chat.functions.ts`), persona-memory
summarization, persona-onboarding tone/opener generation.

- **Training use: by default, YES.** Lovable's own docs state: *"Customer data
  may be used for model training and other business purposes as described in
  our Terms of Service."* (docs.lovable.dev/features/business/data-opt-out)
- **Opt-out exists but is not self-serve on every plan.** Business/Enterprise
  workspaces can enable "Data collection opt out" in Settings → Privacy &
  security. Free/Pro workspaces must contact Lovable Support directly — there
  is no in-product toggle for them.
- **Zero data retention: not offered/mentioned** in Lovable's gateway docs as
  of this review.
- **Action needed, not yet done as of this review:** confirm which Lovable
  plan this project is on, and if Business/Enterprise, enable the workspace
  opt-out. Until that's done, assume chat content sent through this gateway
  may be used for Google/Lovable model training.

## Venice AI (`venice_video`, image generation, `VENICE_CHAT_MODEL` explicit chat)

Used for: explicit-tier chat text, image generation, video generation.

- **Training use: NO, per Venice's stated policy.** *"We do not collect or
  retain your Prompts or Outputs"* and Venice operates *"a zero data retention
  policy with our model providers in which our model providers are prohibited
  from storing, retaining, or using any of your Prompts or Outputs beyond the
  time strictly necessary to process and return a response."*
  (venice.ai/legal/privacy-policy, docs.venice.ai/overview/privacy)
- **Zero data retention: yes, stated as the default/only mode** for prompt and
  response content. Venice does log separate operational metadata (auth,
  billing, abuse prevention, analytics) — but not prompt/response content
  itself.
- **Caveat, stated here deliberately:** these are Venice's own vendor
  statements. Neither this document nor Venice's docs claim an independent
  third-party audit has verified zero-retention behavior in practice.

## Review status

The authoritative, current status (reviewed_at, next_review_due, per-provider
covers_creator_data/covers_supporter_data) lives in the
`provider_data_handling_records` table, surfaced in the admin dashboard.
**As of this document's creation, neither provider row has actually been
reviewed and confirmed by a human — both are seeded as unreviewed/overdue.**
This markdown file documents what was found via public vendor documentation;
it does not substitute for that human review.
