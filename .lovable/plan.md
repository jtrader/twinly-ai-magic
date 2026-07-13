# Persona form: dialog → dedicated pages + Venice field rename

## Why

`src/routes/studio.personas.tsx` is 1,744 lines. The create and edit forms live inside two shadcn `Dialog`s (`CreatePersonaDialog`, `EditPersonaDialog`), each with 6+ tabs, uploads, video generation, invites, and a `VeniceCharacterField`. That causes real accessibility and UX problems:

- Focus is trapped inside a single scrolling modal for a very long form.
- Long content forces awkward inner scroll while the page background scrolls too.
- Mobile: dialog eats the viewport and the sticky footer covers inputs.
- Deep sections (Twin/Invites/Saved) are not linkable — no URL, no back button, no browser history.
- Screen-reader users hear one enormous `<dialog>` with heading levels reset inside.

Moving to dedicated pages fixes all of the above and lets us use proper `<main>`, semantic headings, and a scrollable page instead of a modal.

Separately: the Venice quick-start field is labeled ambiguously and the helper text doesn't tell creators where in Venice to actually find the slug.

## Scope

1. New route: `/studio/personas/new` — replaces `CreatePersonaDialog`.
2. New route: `/studio/personas/$personaId/edit` — replaces `EditPersonaDialog` (keeps the existing tab set: Basics, Training, Packs, Twin, Invites, Saved).
3. Update `/studio/personas` list page: replace "New persona" dialog trigger with a `<Link to="/studio/personas/new">` button, and each row's "Edit" opens the new edit route via `<Link>`.
4. Rename the Venice field to **"Venice Character ID"** and rewrite its helper text with concrete steps to find the slug on venice.ai.
5. Delete `CreatePersonaDialog` and `EditPersonaDialog` once their contents are moved.

Delete confirmation (`AlertDialog`) stays on the list page — it's short and modal is the right pattern there.

## Page structure (both new routes)

Wrap in the existing `AppShell` and render a real `<main>` with breadcrumb + page title, then the form. Use the existing `DashboardNav` breadcrumbs for `Studio › Personas › New` / `… › Edit <name>`.

```text
AppShell
 └─ <main>
     ├─ Breadcrumb: Studio › Personas › New | Edit "<name>"
     ├─ h1: New persona | Edit <name>
     ├─ Tabs (edit only): Basics · Training · Packs · Twin · Invites · Saved
     └─ Form sections (semantic <section> with h2 per section)
        Sticky bottom bar: Cancel (Link back to /studio/personas) · Save
```

On save: navigate back to `/studio/personas` (create) or stay on the edit page and toast success (edit), matching current dialog behaviour.

## Accessibility fixes rolled in during the move

- Replace the dialog wrapper with `<main>` + `<h1>`; every current in-dialog `h4`/`h5` becomes `h2`/`h3` in document order.
- One `<main>` per route (rule from a11y skill).
- Sticky footer becomes `role="region" aria-label="Form actions"` with `min-h-14` and buttons at ≥ 44×44.
- All icon-only buttons in the form (avatar remove, invite copy, saved-message actions) get `aria-label`s where missing.
- Long textareas keep visible labels (already present) — no `aria-label`-only inputs.
- Replace any `h-screen` in the new routes with `h-dvh` where a full-height area is used.
- Preserve keyboard tab order by keeping fields in their current visual order.

Out of scope: rewriting individual field components or business logic. This is a container swap plus one label/helper rename.

## Venice Character ID rename

In `VeniceCharacterField`:

- **Label**: `Venice Character ID (optional)`
- **Helper text** (replaces current copy):
  > Give this persona an established look and voice from a Character you've already published on Venice. To find the ID:
  > 1. Sign in at venice.ai and open your Character.
  > 2. In the URL `venice.ai/c/<id>`, the last segment is the Character ID (also shown as "Public ID" on the Character page).
  > 3. Paste it here (e.g. `alan-watts`), then press **Preview** to confirm.
  >
  > Only takes effect on replies routed through Venice.
- **Placeholder**: unchanged (`e.g. alan-watts`).
- **Preview button**: unchanged behaviour (already calls `lookupVeniceCharacter`).

Server field name (`veniceCharacterSlug` / DB column `venice_character_slug`) does not change — only the user-facing label and helper.

## Files touched

- Add: `src/routes/studio.personas.new.tsx`
- Add: `src/routes/studio.personas.$personaId.edit.tsx`
- Edit: `src/routes/studio.personas.tsx` — remove the two dialog components and their state; wire list buttons to `<Link>`s; keep the delete `AlertDialog`.
- Edit: `src/components/twinly/DashboardNav.tsx` — add labels for the two new routes so breadcrumbs read cleanly.
- Reuse (no changes): `VeniceCharacterField` moves into a shared spot (either kept in `studio.personas.tsx` and imported, or moved to `src/components/twinly/VeniceCharacterField.tsx`) — I'll extract it to the component folder so both new pages import cleanly.

## Verification

- `bunx tsgo --noEmit` clean.
- Manual: create a new persona from `/studio/personas/new`, land back on the list. Edit an existing one from `/studio/personas/<id>/edit`, tabs deep-linkable via `?tab=training` if it's already implemented (otherwise unchanged).
- Screenshot the new edit page on mobile viewport and confirm no focus trap and the sticky action bar is reachable.
