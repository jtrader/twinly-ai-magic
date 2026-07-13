## Live preview + resilient error handling for the onboarding Character ID step

Enhance the Step 2 "Character ID (optional)" panel in `src/routes/studio.twin-onboarding.tsx` so a pasted Venice slug produces a prominent live preview, surfaces real errors clearly, offers a one-tap retry, and — if Venice keeps failing — falls back to a JSON paste box the creator can fill by hand.

### 1. Split "not found" from "lookup failed" in the server fn

`src/lib/venice-character.functions.ts` currently either returns `{found: true|false}` or throws — the field then can't tell the two failure modes apart. Update the handler to catch upstream/network errors and return a third shape:

```ts
type LookupVeniceCharacterResult =
  | { found: true; character: {...} }
  | { found: false }
  | { error: true; message: string };   // NEW — Venice API unreachable / non-200
```

No throws for transport errors; validation errors (empty slug) still throw. Existing call sites keep working because they already narrow on `found`.

### 2. `VeniceCharacterField` — richer preview + retry + failure counter

`src/components/twinly/persona-form-shared.tsx`:

- **Preview card** (when `result.found === true`): keep the current row but bump image to `size-16`, add rounded card with border, show name (`text-sm font-semibold`), author, adult badge (`18+` pill), and 3-line description. Reuse the same component everywhere it's already rendered — the persona-editor call sites already look correct with a slightly bigger preview.
- **"Not found"**: keep the red line, add a small "Double-check the ID on venice.ai" hint and a **Retry** button that re-runs `check()`.
- **"Lookup failed"** (the new `error` branch): amber card with the message, a **Retry** button, and — this is the trigger — increment an internal `failCount` state.
- **`failCount >= 2`**: reveal a new "Paste character JSON instead" `<details>` block (see step 3). Once revealed it stays visible for the rest of the session even if a later retry succeeds, so the creator isn't locked into a flaky loop.
- Add a new optional prop `onManualPreview?: (preview: {name; photoUrl; ...}) => void` so callers (onboarding) can capture the parsed JSON preview if they want to show it above the field.

### 3. Manual JSON fallback

Inside the same field, behind the `<details>` disclosure:

- A `<Textarea>` labeled "Paste character JSON (from venice.ai export or the Network tab)".
- **Parse** button runs `z.object({ slug: z.string().min(1), name: z.string().min(1), description: z.string().nullable().optional(), photoUrl: z.string().url().nullable().optional(), author: z.string().optional(), adult: z.boolean().optional() }).parse(JSON.parse(text))`.
- On success: set `result` to `{ found: true, character: parsed }` locally (bypasses the API), also call `onChange(parsed.slug)` so Save persists the slug, and surface a small "Manually verified — Twinly will re-check on save" note. Do NOT mark the persisted record as verified — the DB still just stores the slug string.
- On parse failure: inline zod error under the textarea.
- Clear-textarea button + a link back to the auto-lookup path.

### 4. Onboarding step wrapper (Step 2)

`src/routes/studio.twin-onboarding.tsx`, step 2 block:

- Wrap `<VeniceCharacterField>` in a `<section aria-labelledby="onboarding-venice-heading">` with the existing heading.
- Above the field, add a static "What you'll see" note: "A live preview of the Character's name, avatar and description will appear here once the ID checks out."
- Below the field, if `result?.found === true` (via the new `onManualPreview` or by lifting the field's state through a callback), render a larger echo preview card summarising the character — this is the "prominent" preview requested. Reuses the same data, no extra API call.
- Continue/Skip button behaviour unchanged. If a `found:false` or `error:true` result is on screen, disable "Save & continue" (keep "Skip") and show inline text "Fix or skip this step before continuing" — protects against saving obviously bad IDs during the guided flow, without blocking creators who genuinely want to skip.

### 5. Files touched

- **Edit** `src/lib/venice-character.functions.ts` — add `error` branch, catch upstream failures.
- **Edit** `src/components/twinly/persona-form-shared.tsx` — enlarge preview, add retry, add JSON textarea fallback, add `onManualPreview` prop.
- **Edit** `src/routes/studio.twin-onboarding.tsx` — wire the enhanced field into Step 2 with the wrapper section, echo preview, and gated Continue button.

### 6. Accessibility

- Preview cards use `aria-live="polite"` (already present on the field).
- Retry button carries `aria-label="Retry Venice lookup"`.
- `<details>` for the JSON fallback keeps it keyboard-toggleable without custom ARIA.
- Error text keeps `role="alert"` for the "not found" and lookup-failed states.

### Non-goals

- No schema changes (still storing just `venice_character_slug`).
- No caching layer — retries hit Venice directly, throttled by the existing 500 ms debounce.
- No changes to the persona-editor call sites' layout beyond the richer preview card that flows naturally from the shared field.
