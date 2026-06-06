# Rubik's Cube 3×3×3 Solver

An interactive, browser-based Rubik's Cube solver. Scramble the cube (or paint in
your own cube's colours), press **Solve**, and step through a short, optimal-ish
solution on an animated 3D cube.

**Live demo:** https://blurboy1985.github.io/rubiks-cube-solver/

## Features

- **Interactive 3D cube** rendered with [Three.js](https://threejs.org/) — drag to orbit.
- **2D net editor** — paint each sticker to match a real, physical cube.
- **One-click scramble** with a random 25-move sequence.
- **Two-phase (Kociemba) solver** running in a Web Worker, so the UI never freezes.
  Solutions are typically ~20 moves.
- **Step-by-step playback** — play/pause, single-step, jump to any move, speed control.
- Works entirely client-side; no backend, no build step. Just static files.

## How it works

| Layer | Responsibility |
| --- | --- |
| `index.html` / `css/style.css` | Layout and styling. |
| `js/cube3d.js` | Draws the 27 cubies from a 54-character facelet string and animates a single face turn at a time. |
| `js/app.js` | App state, the 2D net editor, scramble/paint/validation, and solution playback. |
| `js/solver-worker.js` | Builds the solver tables once, then solves submitted states off the main thread. |
| `vendor/` | Vendored [Three.js](https://github.com/mrdoob/three.js) and [cubejs](https://github.com/ldez/cubejs) (both MIT). |

State is stored as a standard URFDLB facelet string. The solver is the open-source
two-phase algorithm; this project provides the original UI, 3D rendering, net editor,
and playback around it.

## Running locally

It's all static files, so any static server works:

```bash
npx serve .
# then open the printed http://localhost:... URL
```

(Opening `index.html` directly via `file://` won't work because the solver runs in a
Web Worker, which requires `http://`.)

## Move notation

Standard Singmaster notation: `U D L R F B` are the six faces; a plain letter is a
90° clockwise turn (looking at that face), `'` is counter-clockwise, and `2` is a
180° turn.

## Credits & licence

- Solver: [cubejs](https://github.com/ldez/cubejs) by the cubejs authors (MIT).
- 3D engine: [Three.js](https://github.com/mrdoob/three.js) (MIT).
- This UI and app code: MIT (see `LICENSE`).

This is an independent educational project and is not affiliated with any commercial
solver website.
