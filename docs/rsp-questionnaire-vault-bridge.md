# RSP questionnaire-to-vault bridge

The bridge spans two services without moving plaintext supporter answers into Twinly-content.

```text
supporter client
  → authenticated journey service
  → validate consent + server scope
  → AES-256-GCM encrypted source store
  → hard policy envelope
  → minimized feature/state profile
  → Twinly-content controlled retrieval request
  → hard-filtered, stage-specific ranked assets
  → sequence with versioned fallbacks
  → creator review
  → minimized runtime context + output validator
```

The client submits questionnaire answers, a consent receipt, and bounded session context only. Policy, profile, state interpretation, ranking weights, briefs, asset IDs, and sequence instructions are discarded if supplied by a client and generated server-side.

## Encryption and retention

Each submission gets a random 256-bit data key. Questionnaire JSON is encrypted with AES-256-GCM. The data key is separately wrapped with the configured 256-bit master key. Both operations use distinct 96-bit nonces and bind creator scope, submission ID, field path, and schema version as authenticated associated data. Authentication tags and an associated-data hash make ciphertext swapping detectable. `RSP_ENCRYPTION_KEY` must be supplied through managed secrets and key versions must remain available only for the active retention window.

When preferences are not saved, no profile token is created and derived records expire immediately after the session. Retention jobs cascade through encrypted answers, tokens, profiles, retrieval projections, sequences, briefs, and caches. Audit records contain category-level events and purposes only; decryption must create a dedicated audited event.

## Trust boundary

Twinly-content receives `requestId`, opaque creator scope, policy hash, tag/ranking versions, hard-filter IDs, controlled soft tags, a five-state vector, profile-quality bands, and journey requirements. It never receives display name, supporter ID, raw answers, exact excluded wording, price values, or free text. The content service applies creator ownership, lifecycle, review, license, provenance, safety, adult gate, consent, exclusions, boundaries, platform, visibility, subscription, offer, availability, and journey-stage filters before scoring.

The AI runtime receives one approved versioned asset, persona instructions, a privacy-safe brief, hard constraints, and allowed transitions. Failed output validation selects `journey.safe_redirect`; hard constraints are never relaxed to find a result.

## Manual verification

Deploy both pending migrations to non-production projects. Configure a test key through managed secrets. Verify encryption round trips and fails after creator/submission/AAD changes. Submit with offers disabled and confirm no offer stage. Submit ask-first teasing and confirm boundary calibration. Test RLS as supporter, creator, unrelated creator, editor, and service role. Confirm deletion removes all linked derived records and that routine admin pages cannot select ciphertext.
