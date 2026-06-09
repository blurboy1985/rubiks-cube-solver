# Make "Snap from photos" work on the live site

GitHub Pages is served over **https**, but OpenCode Go can't be called directly
from a browser (no CORS headers), and an https page can't call `http://localhost`.
The fix is a tiny **Cloudflare Worker** that relays the request and adds CORS.
It's free and takes about 5 minutes. No command line required.

## 1. Create the Worker (dashboard, no CLI)

1. Sign up / log in at https://dash.cloudflare.com (free plan is fine).
2. Left sidebar → **Workers & Pages** → **Create application** → **Create Worker**.
3. Choose **Start with Hello World** → name it `cube-proxy` → **Deploy**. Your URL
   will be `https://cube-proxy.<your-subdomain>.workers.dev`.
4. On the worker page click **Edit code** (the `</>` editor). Select-all, delete the
   sample, paste the **entire contents of `worker.js`** from this repo, then **Deploy**.

> ⚠️ Do **not** drag-and-drop the `worker.js` file into the "upload" box — that flow
> is for pre-built/bundled projects and will error with *"This uploader does not yet
> support projects that require a build process."* Always paste into the **Edit code**
> editor, or use Wrangler (below).

## 2. Lock it to your site (recommended)

So the Worker only serves your cube page (not the whole internet):

1. On the Worker → **Settings** → **Variables and Secrets**.
2. Add a **plaintext** variable:
   - Name: `ALLOWED_ORIGIN`
   - Value: `https://blurboy1985.github.io`
3. **Save and deploy**.

## 3. Pick how the API key is handled

**Option A — key stays in your browser (simplest).**
Do nothing extra. In the app you'll paste your OpenCode Go key into the ⚙︎ box as
usual; it's stored only in your browser and passed through the Worker.

**Option B — key lives in the Worker (key never in the browser).**
1. Worker → **Settings** → **Variables and Secrets** → add a **Secret**:
   - Name: `OPENCODE_KEY`
   - Value: your OpenCode Go API key (`sk-...`)
2. **Save and deploy**.
3. In the app's ⚙︎ box you can type any placeholder as the key — the Worker
   ignores it and uses its own secret.

> Note: Option B means anyone who loads your page could spend your OpenCode
> credits. The `ALLOWED_ORIGIN` lock from step 2 limits this to requests coming
> from your site, which is good enough for a personal demo. Option A avoids the
> issue entirely because each person uses their own key.

## 4. Point the app at the Worker

1. Open your live site, click **📷 Snap from photos** → **⚙︎ AI key & endpoint**.
2. Set the **endpoint** to:
   ```
   https://cube-proxy.<your-subdomain>.workers.dev/zen/go/v1/chat/completions
   ```
   (use your real Worker URL; keep the `/zen/go/v1/chat/completions` path)
3. Enter your key (Option A) or any placeholder (Option B), **Save**.
4. Take a photo — it now routes through the Worker to OpenCode Go.

## Optional: deploy with the CLI instead

If you prefer the terminal:

A `wrangler.toml` is already included, so deployment is one command:

```bash
npm i -g wrangler
wrangler login
# from this repo folder:
wrangler deploy
# Option B only — store the key in the Worker as a secret:
wrangler secret put OPENCODE_KEY
```

`ALLOWED_ORIGIN` is set in `wrangler.toml` (edit it to your Pages origin). The
`wrangler deploy` output prints your `https://cube-proxy.<subdomain>.workers.dev` URL.

## Troubleshooting

- **"Failed to fetch" still** — the endpoint in ⚙︎ must be the `https://...workers.dev`
  URL, not `localhost`. Hard-refresh the page after changing it.
- **403 "Origin not allowed"** — `ALLOWED_ORIGIN` doesn't exactly match your site's
  origin (scheme + host, no trailing slash). For GitHub Pages it's
  `https://blurboy1985.github.io`.
- **401** — the API key is wrong/expired (Option A: fix it in ⚙︎; Option B: update
  the `OPENCODE_KEY` secret).
