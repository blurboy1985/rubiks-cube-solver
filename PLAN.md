# UX Improvement Plan — Mobile & Kids/Toddlers

Goal: make Magic Cube Solver feel like a polished, friendly mobile app for small hands, with a lovable mascot and zero-frustration interactions. The app is already kid-themed (Fredoka font, emoji buttons, confetti, Color Fun tab); this plan builds on that base.

## Phase 1 — Mobile-first layout & touch

1. **Single-column mobile layout rework.** Today the 820px breakpoint just stacks the panels. Redesign for portrait phones: 3D cube fills the top ~45% of the viewport (`height: min(48vh, 380px)` instead of fixed 440px), with a sticky bottom action bar holding the 3 primary buttons (Mix / Solve / Paint) so they're always thumb-reachable. Secondary actions (Photo, Save, Share) move into a "More" sheet.
2. **Bigger touch targets everywhere.** Minimum 48×48px hit areas: playback buttons, palette swatches, net stickers (enlarge the 2D net cells on mobile or make it pinch-zoomable). Add `touch-action: manipulation` to kill the 300ms tap delay and double-tap zoom on buttons.
3. **Viewport polish.** `viewport-fit=cover` + `env(safe-area-inset-*)` padding for notched phones; `100dvh` instead of `100vh`; prevent pull-to-refresh while rotating the cube (`overscroll-behavior: none`).
4. **Gesture upgrades on the 3D cube.** Pinch to zoom, two-finger drag to orbit, one-finger swipe on a face to turn that layer directly (the most natural cube interaction for kids). Larger raycast tolerance so chubby fingers hit stickers.
5. **Performance on low-end phones.** Cap devicePixelRatio at 2, pause the Three.js render loop when the tab/view is hidden, lazy-init the Color Fun game (already done) and the solver tables.
6. **PWA.** Add `manifest.json` + service worker so it installs to the home screen, runs fullscreen without browser chrome, and works offline (everything is already client-side). Add proper app icons.

## Phase 2 — Kids & toddler experience

7. **"Cubie" the mascot — animated avatar.** A cute cube character (SVG, no assets to download) with big eyes that lives in a corner of the screen:
   - Blinks and idles; eyes follow the cube while it rotates.
   - Reacts: wobbles excitedly during scramble, puts on a thinking face while solving, cheers with the confetti on success, looks sad-then-encouraging on invalid paint states.
   - Speech bubble replaces the dry `#status` text: "Hmm, let me think…", "Got it! Only 19 magic steps!", "Oops, two squares are the same colour — can you fix them?"
   - Selectable skins later (robot, cat, dino) stored in `localStorage`.
8. **Sound & speech.** Reuse the WebAudio engine from `toddler.js` app-wide: soft pops on button taps, whoosh per cube turn, fanfare on solve. Optional Web Speech API narration of instructions ("Turn the top… this way!") for pre-readers. Global mute button, default ON for effects, OFF for speech.
9. **Toddler Mode toggle.** A big switch (parent-gated, see #12) that simplifies the solver screen: hides Save/Share/scramble-notation/photo rows, leaves only Mix it up! / Solve it! / Play, doubles button sizes, and auto-plays the solution slowly with Cubie narrating. Letters like "U2" never shown — only arrows drawn on the 3D cube.
10. **Visual move arrows.** Overlay a curved 3D arrow on the face about to turn during playback, so non-readers can follow along on a real cube. Pair each step with plain words ("top layer ↻") instead of notation.
11. **Rewards & collection.** Sticker book: each solved cube (or finished Color Fun picture) earns a sticker/badge with a little celebration. Streaks shown as stars, never as failure. All local, no accounts.
12. **Parental gate.** Settings, API key entry, and external links go behind a simple "hold 3 seconds" or "what is 3 + 4?" gate so toddlers can't wander into them.
13. **Color Fun upgrades.** More pictures, a free-draw canvas mode, and Cubie cameos cheering progress; haptic tick (`navigator.vibrate`) on each filled square where supported.

## Phase 3 — Polish & accessibility

14. **Readability & a11y.** Bump contrast of soft-purple text on white cards to WCAG AA, `aria-label`s on emoji-only buttons, honor `prefers-reduced-motion` for Cubie/blobs/confetti (partially done), focus-visible styles.
15. **Colour-blind support.** Optional letter/shape glyphs on stickers (W, Y, ♥, ★) in paint mode.
16. **Orientation handling.** Landscape phone layout: cube left, controls right; gentle "rotate your phone" hint only if the layout truly can't fit.
17. **Empty/error states with personality.** Cubie explains photo-scan failures or solver errors in kid words, with one obvious recovery button.

## Suggested order of implementation

Phase 1 items 1–3 (highest impact, lowest risk) → 7 (Cubie MVP: idle + react + speech bubble) → 9–10 (Toddler Mode + arrows) → 6 (PWA) → the rest as polish.

## Success criteria

- All primary actions reachable one-handed on a 360×640 screen; no horizontal scroll.
- A 3-year-old can mix and watch a solve without reading anything or hitting a dead end.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, PWA installable.
