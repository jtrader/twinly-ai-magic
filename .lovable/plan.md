## Goal

Give each card in the "Persona system" section on the home page (`src/routes/index.tsx` → `PersonaGrid`) a hero image that reuses the **same subject/model** as `src/assets/hero-ai.png` (dark-haired woman in glasses with neon aura), but re-lit and re-styled to match each persona's flavor.

## Source model

Base image: `src/assets/hero-ai.png` (existing hero). Every variant is produced with `imagegen--edit_image` using this file as `image_paths[0]` so the face, hair, and general likeness stay consistent. Only wardrobe, lighting, mood, and background change.

## Per-persona prompts

All variants share this preamble: *"Keep the exact same woman as the reference — same face, same long dark hair, same subtle smile. Portrait crop, cinematic 3D render, soft rim lighting, no text, no logos."*

1. **Real Me** → `src/assets/persona-real-me.png`
   - Flavor: authentic, human, no AI.
   - Prompt add: warm natural daylight, no neon, no glasses, cozy off-white knit sweater, softly blurred sunlit bedroom window behind her, candid unretouched feel, gentle golden-hour tones.

2. **Nice AI** → `src/assets/persona-nice-ai.png`
   - Flavor: warm, playful, SFW.
   - Prompt add: bright pastel aura (mint, peach, soft lavender), friendly open smile, casual pastel hoodie, floating soft light particles, cheerful and approachable.

3. **Naughty AI** → `src/assets/persona-naughty-ai.png`
   - Flavor: flirty with boundaries.
   - Prompt add: hot pink and magenta rim light, playful smirk over the shoulder, glossy black cropped jacket, subtle sparkle bokeh, confident and flirty (still tasteful, shoulders-up crop).

4. **Wicked AI** → `src/assets/persona-wicked-ai.png`
   - Flavor: adults-only VIP.
   - Prompt add: deep crimson and violet lighting, dark smoky background, sleek black latex-look high-neck top, sultry half-lit expression, moody film-noir contrast (shoulders-up crop, no explicit content).

5. **Custom** → `src/assets/persona-custom.png`
   - Flavor: unlimited themed personas.
   - Prompt add: kaleidoscopic split-lighting across the face (cyan / magenta / gold / green), holographic prism refractions in the background, subtle "multiple exposures" ghosting suggesting many personas layered into one.

Each call uses `transparent_background: false`, keeps the source dimensions (omit width/height), saves as `.png` (portraits with soft glows keep better in PNG than JPG here).

## Wiring the images into the cards

Edit `src/routes/index.tsx`:

- Import the 5 new asset JSONs.
- Extend each item in `PersonaGrid`'s `items` array with an `image` field pointing at the imported asset's `url`.
- Update the card markup: add an `<img>` above the name/badge row — `aspect-[4/5]` (matches the portrait source), `object-cover`, `rounded-xl`, subtle inner border, `loading="lazy"`, and a persona-specific `alt` (e.g. *"Nice AI persona portrait"*).
- Keep existing badge, name, and blurb below the image; keep the current 1/2/3-column responsive grid and the disclaimer paragraph unchanged.

No other sections, routes, or components change.

## Out of scope

- No changes to the hero, auth page, or `TwinlyWordmark`.
- No new components — the card markup stays inline in `PersonaGrid`.
- No copy changes to persona names or blurbs.
