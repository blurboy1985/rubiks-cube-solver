# Rubik's Cube 3×3×3 Solver

An interactive, browser-based Rubik's Cube solver. Scramble the cube (or paint in
your own cube's colours), press **Solve**, and step through a short, optimal-ish
solution on an animated 3D cube.

**Live demo:** https://blurboy1985.github.io/rubiks-cube-solver/

## Features

- **Interactive 3D cube** rendered with [Three.js](https://threejs.org/) — drag to orbit.
- **2D net editor** — paint each sticker to match a real, physical cube.
- **📷 Snap from photos** — photograph your real cube one face at a time and a vision
  model (**Kimi** `kimi-k2.6` via OpenCode Go) reads the sticker colours, so you don't
  paint all 54 by hand. A guided 6-face wizard walks you through holding the cube; iPhone
  **HEIC/HEIF** photos are converted automatically, and every detected colour stays
  editable before you solve.
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
| `js/photo.js` | The "Snap from photos" wizard: guided 6-face capture, the Kimi vision call, and the editable colour-review grid. |
| `js/solver-worker.js` | Builds the solver tables once, then solves submitted states off the main thread. |
| `vendor/` | Vendored [Three.js](https://github.com/mrdoob/three.js) and [cubejs](https://github.com/ldez/cubejs) (both MIT). |

### 📷 Snap from photos (Kimi vision)

Press **📷 Snap from photos** to fill the cube from real photos instead of painting.
The wizard guides you through the six faces one at a time, anchored to the classic
*white-up / green-front* hold (centres never move), and sends each straight-on photo from
your browser to Kimi (`kimi-k2.6`), which returns that face's nine sticker colours. iPhone
HEIC/HEIF files are converted to JPEG in the browser before sending — first via the
browser's native decoder (Safari/iPhone), falling back to a bundled libheif decoder
(heic-to) elsewhere.

- Your **API key is stored only in your browser** (`localStorage`) and is never bundled
  into the page or committed to the repo. You paste it once, in-app.
- The endpoint defaults to `https://opencode.ai/zen/go/v1/chat/completions` (OpenCode Go,
  OpenAI-compatible) and is overridable in the same dialog — e.g. point it at Moonshot
  (`https://api.moonshot.ai/v1/chat/completions`) if you use a direct Kimi key instead.
- Because the app is fully static, the request is cross-origin and OpenCode Go does
  not send CORS headers, so a **direct browser call is blocked** ("Failed to fetch").
  For local development a tiny pass-through proxy is included — see below. If no proxy
  is reachable the photo still shows as a reference and you can tap the squares by hand.

#### Local CORS proxy

```bash
node proxy.js          # starts http://localhost:8787 (Node 18+, zero deps)
npx serve .            # in another terminal, serve the site
```

Then in the wizard click **⚙︎ AI key & endpoint** and set the endpoint to:

```
http://localhost:8787/zen/go/v1/chat/completions
```

`proxy.js` forwards each request (your `Authorization` header included) to
`https://opencode.ai` and adds the CORS header the browser needs. It never stores
your key. For a deployed site you'd host the same logic as a serverless function
(e.g. a Cloudflare Worker) and point the endpoint at that URL instead.

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
