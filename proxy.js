/* Tiny zero-dependency CORS proxy for local development.
 *
 * Why: GitHub-Pages-style static sites are served from one origin (e.g.
 * http://localhost:3000) but OpenCode Go lives on https://opencode.ai, and that
 * API doesn't return the CORS headers a browser needs — so a direct fetch from
 * the page fails with "Failed to fetch". This proxy sits in the middle, forwards
 * your request (Authorization header and all) to opencode.ai, and adds the CORS
 * header so the browser is happy. Your API key still travels from the browser;
 * this is a thin pass-through and never stores it.
 *
 * Run:   node proxy.js
 * Then in the app's "AI key & endpoint" box set the endpoint to:
 *        http://localhost:8787/zen/go/v1/chat/completions
 *
 * Requires Node 18+ (uses the built-in fetch).
 */
'use strict';
const http = require('http');

if (typeof fetch !== 'function') {
  console.error('This proxy needs Node 18+ (global fetch). Your version: ' + process.version);
  process.exit(1);
}

const PORT = process.env.PORT || 8787;
const TARGET_ORIGIN = 'https://opencode.ai';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // Collect the incoming body
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const body = Buffer.concat(chunks);
    const targetUrl = TARGET_ORIGIN + req.url; // e.g. /zen/go/v1/chat/completions
    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          // Pass the user's bearer token straight through (never stored).
          ...(req.headers['authorization'] ? { Authorization: req.headers['authorization'] } : {}),
        },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        ...CORS,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Proxy could not reach upstream: ' + err.message } }));
    }
  });
});

server.listen(PORT, () => {
  console.log('CORS proxy on http://localhost:' + PORT);
  console.log('Forwarding -> ' + TARGET_ORIGIN);
  console.log('Set the app endpoint to: http://localhost:' + PORT + '/zen/go/v1/chat/completions');
});
