/* Cloudflare Worker — CORS proxy for OpenCode Go.
 *
 * Lets the GitHub Pages site (https) call OpenCode Go from the browser, which it
 * otherwise can't because OpenCode Go sends no CORS headers. This Worker forwards
 * the request and adds the CORS header the browser needs.
 *
 * Deploy it, then in the cube app's ⚙︎ box set the endpoint to:
 *     https://<your-worker>.workers.dev/zen/go/v1/chat/completions
 *
 * Two optional environment variables (set in the Cloudflare dashboard):
 *   ALLOWED_ORIGIN  e.g. https://blurboy1985.github.io
 *                   Locks CORS + access to your site only. Recommended.
 *   OPENCODE_KEY    Your OpenCode Go API key as a *secret*.
 *                   If set, the Worker injects it and the browser never holds the
 *                   key (enter any placeholder in the app to get past the prompt).
 *                   If NOT set, the browser's own key is passed through.
 */

const UPSTREAM = 'https://opencode.ai';

export default {
  async fetch(request, env) {
    const allow = env.ALLOWED_ORIGIN || '*';
    const reqOrigin = request.headers.get('Origin') || '';

    const cors = {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // If an allow-list origin is configured, reject other browser origins.
    if (allow !== '*' && reqOrigin && reqOrigin !== allow) {
      return json(403, { error: { message: 'Origin not allowed' } }, cors);
    }

    const url = new URL(request.url);
    const target = UPSTREAM + url.pathname + url.search; // e.g. /zen/go/v1/chat/completions

    const headers = { 'Content-Type': request.headers.get('Content-Type') || 'application/json' };
    if (env.OPENCODE_KEY) {
      headers['Authorization'] = 'Bearer ' + env.OPENCODE_KEY;     // injected secret
    } else {
      const auth = request.headers.get('Authorization');
      if (auth) headers['Authorization'] = auth;                   // pass the browser's key through
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : await request.arrayBuffer(),
      });
    } catch (e) {
      return json(502, { error: { message: 'Upstream fetch failed: ' + e.message } }, cors);
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  },
};

function json(status, obj, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
