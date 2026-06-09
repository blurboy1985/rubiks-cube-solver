/* Photo-to-paint wizard.
 *
 * Two ways to scan a real cube into the app:
 *   • Quick   — 2 corner photos, each showing 3 faces (top-front-right, then the
 *               opposite corner). Fewer photos, but reading angled faces is less
 *               accurate, so every sticker stays editable and each face has a
 *               one-tap rotate button.
 *   • Precise — 6 straight-on photos, one per face. Most reliable.
 *
 * Each photo is sent to Kimi (kimi-k2.6) via OpenCode Go. iPhone HEIC/HEIF photos
 * are converted to JPEG in the browser first. Colours map to a 54-char URFDLB
 * facelet string that the app paints onto the cube.
 *
 * Fully client-side: the API key lives only in this browser's localStorage. */
(function (global) {
  'use strict';

  var KIMI_MODEL = 'kimi-k2.6';
  var LS_KEY = 'cube.kimiKey';
  // The endpoint is fixed by where the page is served:
  //  • localhost  -> the local CORS proxy (run `node proxy.js`)
  //  • anywhere else (e.g. GitHub Pages) -> the deployed Cloudflare Worker
  var WORKER_BASE = 'https://cube-proxy.daniel-tianwen.workers.dev/zen/go/v1/chat/completions';
  var LOCAL_BASE  = 'http://localhost:8787/zen/go/v1/chat/completions';
  var DEFAULT_BASE = (function () {
    var h = (location.hostname || '').toLowerCase();
    var isLocal = (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '');
    return isLocal ? LOCAL_BASE : WORKER_BASE;
  })();

  // heic-to bundles a modern libheif (handles iPhone HEIC variants heic2any can't);
  // self-contained IIFE exposing window.HeicTo, WASM inlined (no extra fetch).
  var HEIC_CDN = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.min.js';

  // Western colour scheme: which face each centre colour belongs to.
  var COLOR_TO_LETTER = { white: 'U', yellow: 'D', red: 'R', orange: 'L', green: 'F', blue: 'B' };
  var LETTER_TO_COLOR = { U: 'white', D: 'yellow', R: 'red', L: 'orange', F: 'green', B: 'blue' };
  var FACE_BASE = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };

  // Precise mode: 6 straight-on faces, anchored to white-up / green-front.
  // Faces are captured by POSITION, not colour — hold the cube any way you like,
  // just keep the same grip across all six photos. The app figures out the colour
  // scheme from the centres, so it doesn't matter which colour is up.
  var PRECISE = [
    { letter: 'U', name: 'Top',    hold: 'Hold the cube any comfortable way and <b>keep that grip for all 6 photos</b>. Tilt it so the <b>TOP</b> face points at the camera — keep the side that faces you at the BOTTOM of the picture.' },
    { letter: 'F', name: 'Front',  hold: 'Hold it normally again (same top as before) and photograph the face <b>FACING YOU</b>, straight on.' },
    { letter: 'R', name: 'Right',  hold: 'Turn the whole cube a quarter-turn to the <b>LEFT</b> (same face stays on top). Photograph the new face facing you.' },
    { letter: 'B', name: 'Back',   hold: 'Quarter-turn <b>LEFT</b> again (top unchanged). Photograph the face now facing you.' },
    { letter: 'L', name: 'Left',   hold: 'Quarter-turn <b>LEFT</b> once more (top unchanged). Photograph the face now facing you.' },
    { letter: 'D', name: 'Bottom', hold: 'Face the front again, then tip the cube <b>FORWARD</b> so the <b>BOTTOM</b> points at the camera — keep the side that was facing you at the TOP of the picture.' }
  ];
  // Friendly position names (the U/R/F/D/L/B keys are positions here, not colours).
  var POS_NAME = { U: 'Top', R: 'Right', F: 'Front', D: 'Bottom', L: 'Left', B: 'Back' };


  var COLORS = {};
  var applyState = null;

  // ---- wizard state ----
  var steps = [];           // active step list
  var faceColors = {};      // letter -> [9] (or null)
  var photos = {};          // step index -> dataURL
  var step = 0;
  var activeColor = 'U';
  var busy = false;
  var fileInput = null;
  var overlay = null;

  function init(opts) { COLORS = opts.colors || {}; applyState = opts.applyState; }

  function getKey()  { try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY); } catch (e) {} }
  function getBase() { return DEFAULT_BASE; }
  // When the proxy/endpoint injects the key itself, the browser sends none.
  function proxyHoldsKey()  { try { return localStorage.getItem('cube.proxyKey') === '1'; } catch (e) { return false; } }
  function setProxyHoldsKey(b){ try { if (b) localStorage.setItem('cube.proxyKey', '1'); else localStorage.removeItem('cube.proxyKey'); } catch (e) {} }

  // ---- entry ----
  function open() {
    faceColors = {}; photos = {}; step = 0; activeColor = 'U';
    steps = PRECISE.map(function (f) {
      return { title: 'Face — ' + f.name, hold: f.hold, panels: [f.letter] };
    });
    buildOverlay();
    renderStep();
    document.addEventListener('keydown', onKey);
  }
  function close() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function elt(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function buildOverlay() {
    overlay = elt('div', 'pw-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var card = elt('div', 'pw-card');
    card.innerHTML =
      '<button class="pw-x" title="Close">✕</button>' +
      '<h2 class="pw-title">📷 Snap your cube</h2>' +
      '<div class="pw-steps" id="pwSteps"></div>' +
      '<div class="pw-body" id="pwBody"></div>' +
      '<div class="pw-foot" id="pwFoot"></div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector('.pw-x').addEventListener('click', close);

    fileInput = elt('input');
    fileInput.type = 'file';
    // Allow library or camera, and surface HEIC/HEIF in the picker.
    fileInput.accept = 'image/*,.heic,.heif';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', onFile);
    card.appendChild(fileInput);
  }

  // ---- per-face helpers ----
  function ensureFace(letter) {
    if (!faceColors[letter]) {
      faceColors[letter] = [null, null, null, null, null, null, null, null, null];
    }
    return faceColors[letter];
  }
  function faceFilled(letter) {
    var d = faceColors[letter];
    if (!d) return false;
    for (var i = 0; i < 9; i++) if (!d[i]) return false;
    return true;
  }
  function stepComplete(i) {
    return steps[i].panels.every(faceFilled);
  }
  function allComplete() {
    return ['U', 'R', 'F', 'D', 'L', 'B'].every(faceFilled);
  }

  // ---- render a step ----
  function renderStepDots() {
    var box = document.getElementById('pwSteps');
    box.innerHTML = '';
    steps.forEach(function (s, i) {
      var done = s.panels.every(faceFilled);
      var d = elt('span', 'pw-dot' + (i === step ? ' cur' : '') + (done ? ' done' : ''));
      d.style.background = COLORS[s.panels[0]] || '#bbb';
      box.appendChild(d);
    });
  }

  function renderStep() {
    renderStepDots();
    var s = steps[step];
    var body = document.getElementById('pwBody');
    body.innerHTML = '';

    body.appendChild(elt('p', 'pw-facehead', '<b>' + s.title + '</b>'));
    body.appendChild(elt('p', 'pw-hold', s.hold));

    // photo / capture area
    var shot = elt('div', 'pw-shot');
    if (photos[step]) {
      var img = elt('img', 'pw-photo'); img.src = photos[step]; shot.appendChild(img);
      var retake = elt('button', 'btn sm pw-retake', '🔁 Retake');
      retake.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
      shot.appendChild(retake);
    } else {
      var take = elt('button', 'btn pw-take', '📸 Take or choose a photo');
      take.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
      shot.appendChild(take);
    }
    body.appendChild(shot);

    var settings = elt('button', 'pw-settings', '⚙︎ AI key & endpoint');
    settings.addEventListener('click', function () { showKeyBox('settings'); });
    body.appendChild(settings);

    body.appendChild(elt('p', 'pw-msg', '<span id="pwMsg"></span>'));

    // one editable panel per face in this step
    var panels = elt('div', 'pw-panels');
    s.panels.forEach(function (letter) { panels.appendChild(renderPanel(letter)); });
    body.appendChild(panels);

    // shared correction palette
    body.appendChild(elt('p', 'pw-pallabel', 'Tap a square, then a colour to fix it:'));
    var pal = elt('div', 'pw-pal');
    ['U', 'R', 'F', 'D', 'L', 'B'].forEach(function (L) {
      var sw = elt('button', 'pw-sw' + (L === activeColor ? ' sel' : ''));
      sw.style.background = COLORS[L]; sw.dataset.letter = L; sw.title = LETTER_TO_COLOR[L];
      sw.addEventListener('click', function () {
        activeColor = L;
        Array.prototype.forEach.call(pal.children, function (c) { c.classList.toggle('sel', c.dataset.letter === L); });
      });
      pal.appendChild(sw);
    });
    body.appendChild(pal);

    renderFoot();
  }

  function renderPanel(letter) {
    var panel = elt('div', 'pw-panel');
    var data = faceColors[letter];
    var centerColor = (data && data[4]) ? COLORS[data[4]] : '#cfcfcf';
    var head = elt('div', 'pw-panel-head');
    head.innerHTML = '<span class="pw-cdot" style="background:' + centerColor + '"></span>' +
      POS_NAME[letter] + ' face';
    panel.appendChild(head);

    var grid = elt('div', 'pw-grid');
    for (var i = 0; i < 9; i++) {
      var cell = elt('div', 'pw-cell');
      cell.dataset.letter = letter; cell.dataset.i = i;
      var L = data ? data[i] : null;
      if (i === 4) cell.classList.add('center'); // the centre sticker (just a marker now)
      if (L) { cell.style.background = COLORS[L]; }
      else { cell.classList.add('empty'); }
      cell.addEventListener('click', onCellClick);
      grid.appendChild(cell);
    }
    panel.appendChild(grid);
    return panel;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function onCellClick(e) {
    var letter = e.currentTarget.dataset.letter;
    var i = +e.currentTarget.dataset.i;
    ensureFace(letter)[i] = activeColor;
    e.currentTarget.classList.remove('empty');
    e.currentTarget.style.background = COLORS[activeColor];
    renderStepDots(); renderFoot();
  }

  function renderFoot() {
    var foot = document.getElementById('pwFoot');
    foot.innerHTML = '';
    var back = elt('button', 'btn sm', '◀ Back');
    back.disabled = step === 0;
    back.addEventListener('click', function () { if (step > 0) { step--; renderStep(); } });
    foot.appendChild(back);

    var last = step === steps.length - 1;
    var hint = '';
    if (last) {
      var missing = ['U', 'R', 'F', 'D', 'L', 'B'].filter(function (L) { return !faceFilled(L); });
      if (missing.length) hint = 'Still need every square on: ' + missing.map(function (L) { return POS_NAME[L]; }).join(', ') + ' (use ◀ Back to fix)';
    } else if (!stepComplete(step)) {
      hint = 'Fill every square to continue';
    }
    foot.appendChild(elt('span', 'pw-spacer', hint));

    if (!last) {
      var next = elt('button', 'btn sm btn-solve', 'Next ▶');
      next.disabled = !stepComplete(step);
      next.addEventListener('click', function () { if (stepComplete(step)) { step++; renderStep(); } });
      foot.appendChild(next);
    } else {
      var finish = elt('button', 'btn sm btn-solve', '✨ Paint my cube');
      finish.disabled = !allComplete();
      finish.addEventListener('click', finishWizard);
      foot.appendChild(finish);
    }
  }

  // ---- file handling (with HEIC conversion) ----
  function isHeic(file) {
    var n = (file.name || '').toLowerCase(), t = (file.type || '').toLowerCase();
    return t.indexOf('heic') >= 0 || t.indexOf('heif') >= 0 || /\.(heic|heif)$/.test(n);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var ex = document.querySelector('script[data-src="' + src + '"]');
      if (ex) { if (ex.dataset.loaded) return res(); ex.addEventListener('load', function () { res(); }); ex.addEventListener('error', rej); return; }
      var s = document.createElement('script');
      s.src = src; s.dataset.src = src;
      s.onload = function () { s.dataset.loaded = '1'; res(); };
      s.onerror = function () { rej(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('could not read converted image')); };
      fr.readAsDataURL(blob);
    });
  }

  // 1) Try the browser's own HEIC decoder (works on Safari / iPhone, free).
  function nativeHeicToJpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { URL.revokeObjectURL(url); return reject(new Error('zero-size decode')); }
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0);
          var out = cv.toDataURL('image/jpeg', 0.9);
          URL.revokeObjectURL(url); resolve(out);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('native HEIC decode unsupported')); };
      img.src = url;
    });
  }

  // 2) Fall back to heic-to (bundled libheif) for browsers without native support.
  function libHeicToJpeg(file) {
    return loadScript(HEIC_CDN).then(function () {
      // The IIFE build sets module.exports = heicTo, so window.HeicTo IS the
      // function (with .isHeic attached). Be tolerant of either shape.
      var lib = global.HeicTo;
      var heicTo = (typeof lib === 'function') ? lib
                 : (lib && (lib.heicTo || (lib.default && lib.default.heicTo)));
      if (typeof heicTo !== 'function') throw new Error('heic-to failed to load');
      return heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    }).then(blobToDataURL);
  }

  function fileToDataURL(file, cb) {
    if (!isHeic(file)) {
      var fr = new FileReader();
      fr.onload = function () { cb(fr.result); };
      fr.readAsDataURL(file);
      return;
    }
    setMsg('📱 Converting iPhone photo (HEIC)…', 'busy');
    nativeHeicToJpeg(file)
      .catch(function () { return libHeicToJpeg(file); })
      .then(function (dataURL) { setMsg('', ''); cb(dataURL); })
      .catch(function (e) {
        setMsg('Could not convert that HEIC photo (' + (e && e.message) + '). On iPhone: Settings → Camera → Formats → "Most Compatible", or just upload a JPG/PNG.', 'err');
      });
  }

  function onFile() {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    fileToDataURL(file, function (dataURL) {
      resizeDataURL(dataURL, 1280, function (small) {
        photos[step] = small;
        renderStep();
        detect(small);
      });
    });
  }

  function resizeDataURL(dataURL, maxSide, cb) {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height, scale = Math.min(1, maxSide / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
      try { cb(cv.toDataURL('image/jpeg', 0.85)); } catch (e) { cb(dataURL); }
    };
    img.onerror = function () { cb(dataURL); };
    img.src = dataURL;
  }

  function setMsg(text, kind) {
    var m = document.getElementById('pwMsg');
    if (!m) return;
    m.innerHTML = text || '';
    m.className = 'pw-msg-' + (kind || '');
  }

  // ---- key/endpoint editor ----
  function showKeyBox(modeArg) {
    var body = document.getElementById('pwBody');
    var ex = body.querySelector('.pw-keybox'); if (ex) ex.parentNode.removeChild(ex);
    var haveKey = !!getKey();
    var box = elt('div', 'pw-keybox');
    box.innerHTML = '<p>To read colours automatically, paste your <b>OpenCode Go API key</b>. ' +
      'It is stored only in this browser (localStorage) and sent straight to the API. ' +
      'Or, if your proxy supplies the key, just tick the box below.</p>';
    var row = elt('div', 'pw-keyrow');
    var input = elt('input', 'pw-keyinput'); input.type = 'password';
    input.placeholder = haveKey ? 'API key saved — leave blank to keep it' : 'sk-...';
    // "my proxy holds the key" toggle
    var proxyLabel = elt('label', 'pw-proxykey');
    var cb = elt('input'); cb.type = 'checkbox'; cb.checked = proxyHoldsKey();
    proxyLabel.appendChild(cb);
    proxyLabel.appendChild(document.createTextNode(' My proxy holds the key (don\'t ask me for one)'));
    function syncKeyDisabled() { input.disabled = cb.checked; input.placeholder = cb.checked ? 'not needed — your proxy supplies the key' : (haveKey ? 'API key saved — leave blank to keep it' : 'sk-...'); }
    cb.addEventListener('change', syncKeyDisabled);

    var save = elt('button', 'btn sm btn-solve', modeArg === 'settings' ? 'Save' : 'Save & read');
    save.addEventListener('click', function () {
      var proxy = cb.checked;
      setProxyHoldsKey(proxy);
      var k = input.value.trim() || getKey();
      if (!proxy && !k) { input.focus(); return; }
      if (k) setKey(k);
      box.parentNode.removeChild(box);
      if (photos[step]) detect(photos[step]);
      else setMsg(proxy ? 'Saved — your proxy supplies the key. Take a photo.' : 'Saved. Take a photo to read colours.', 'ok');
    });
    var test = elt('button', 'btn sm', '🔌 Test');
    test.addEventListener('click', function () { testConnection(input.value.trim() || getKey(), getBase()); });
    var cancel = elt('button', 'btn sm', modeArg === 'settings' ? 'Cancel' : 'Skip (paint by hand)');
    cancel.addEventListener('click', function () {
      box.parentNode.removeChild(box);
      if (modeArg !== 'settings') setMsg('No problem — tap the squares to set the colours from your photo.', '');
    });
    row.appendChild(input); row.appendChild(save); row.appendChild(test); row.appendChild(cancel);
    box.appendChild(row);
    box.appendChild(proxyLabel);
    syncKeyDisabled();
    var shot = body.querySelector('.pw-shot');
    shot.parentNode.insertBefore(box, shot.nextSibling);
    input.focus();
  }

  // ---- connection self-test (diagnoses endpoint/key/CORS problems) ----
  function testConnection(key, base) {
    if (location.protocol === 'https:' && /^http:\/\//i.test(base)) {
      setMsg('❌ Your page is HTTPS but the endpoint is HTTP (' + base + '). Browsers block that (mixed content). Use the https Worker URL.', 'err');
      return;
    }
    setMsg('🔌 Testing ' + base + ' …', 'busy');
    var headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    fetch(base, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: KIMI_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    }).then(function (res) {
      return res.text().then(function (t) { return { status: res.status, t: t }; });
    }).then(function (r) {
      if (r.status === 200) setMsg('✅ Connected! Endpoint and key both work. You can scan now.', 'ok');
      else if (r.status === 401 || r.status === 403) setMsg('Reached the proxy/API ✓ but the key was rejected (HTTP ' + r.status + '). Fix the key above.', 'err');
      else if (/<!doctype|<html/i.test(r.t)) setMsg('Reached the server, but got a web page instead of the API. Add the path: the endpoint must end with /zen/go/v1/chat/completions', 'err');
      else setMsg('Reached the server but got HTTP ' + r.status + '. Check the endpoint path (…/zen/go/v1/chat/completions).', 'err');
    }).catch(function (e) {
      setMsg('❌ Could not reach ' + base + ' (' + (e && e.message) + '). Check the Worker URL is correct and deployed, or that `node proxy.js` is running for localhost.', 'err');
    });
  }

  // ---- detection ----
  function detect(dataURL) {
    if (proxyHoldsKey()) { runKimi(dataURL, ''); return; }
    var key = getKey();
    if (!key) { showKeyBox('auto'); return; }
    runKimi(dataURL, key);
  }

  function singlePrompt(letter) {
    return 'This image shows ONE face of a Rubik\'s cube, filling most of the frame. ' +
      'Identify all 9 stickers in the 3x3 grid, reading left-to-right, top-to-bottom ' +
      '(including the centre sticker). Each colour is exactly one of: white, yellow, red, ' +
      'orange, green, blue. Pick the nearest for every sticker. Ignore background, fingers ' +
      'and shadows. Reply ONLY JSON: {"grid": [["c","c","c"],["c","c","c"],["c","c","c"]]}.';
  }

  function runKimi(dataURL, key) {
    if (busy) return;
    busy = true;
    var letter = steps[step].panels[0];
    setMsg('🤖 Reading colours with Kimi…', 'busy');
    var payload = {
      model: KIMI_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      messages: [
        { role: 'system', content: 'You are a precise Rubik\'s cube colour scanner. You only ever reply with JSON.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: dataURL } },
          { type: 'text', text: singlePrompt(letter) }
        ] }
      ]
    };
    var headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;
    fetch(getBase(), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (j) { return { ok: res.ok, status: res.status, j: j }; });
    }).then(function (r) {
      busy = false;
      if (!r.ok) {
        var em = (r.j && r.j.error && (r.j.error.message || r.j.error.type)) || ('HTTP ' + r.status);
        if (r.status === 401) {
          if (proxyHoldsKey()) setMsg('The key stored in your proxy was rejected (HTTP 401). Update the OPENCODE_KEY secret on the Worker.', 'err');
          else { setMsg('That API key was rejected — open ⚙︎ to fix it.', 'err'); setKey(''); }
        }
        else setMsg('Kimi could not read this photo (' + em + '). Retake it or tap the squares to fix colours.', 'err');
        return;
      }
      var content = r.j && r.j.choices && r.j.choices[0] && r.j.choices[0].message && r.j.choices[0].message.content;
      if (!applySingle(content, letter)) { setMsg('Kimi\'s answer was unclear — tap any squares to fix the colours.', 'err'); return; }
      if (!faceFilled(letter)) setMsg('✅ Read it — but a few squares were unclear. Tap the faded ones to set them.', 'ok');
      else setMsg('✅ Read it! Check the squares and fix any that look wrong.', 'ok');
    }).catch(function (err) {
      busy = false;
      var base = getBase(), direct = base.indexOf('opencode.ai') >= 0;
      setMsg('Could not reach the model (' + (err && err.message) + '). ' +
        (direct ? 'You are calling OpenCode Go directly, which the browser blocks (CORS). Run `node proxy.js` and set the endpoint (⚙︎) to http://localhost:8787/zen/go/v1/chat/completions.'
                : 'Is the proxy running? Start it with `node proxy.js`. Meanwhile tap the squares to set colours by hand.'), 'err');
    });
  }

  function parseJSON(content) {
    if (!content) return null;
    try { return JSON.parse(content); }
    catch (e) { var m = content.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e2) {} } return null; }
  }
  function gridToFlat(grid) {
    if (!Array.isArray(grid) || grid.length !== 3) return null;
    var flat = [];
    for (var r = 0; r < 3; r++) {
      if (!Array.isArray(grid[r]) || grid[r].length !== 3) return null;
      for (var c = 0; c < 3; c++) flat.push(String(grid[r][c]).trim().toLowerCase());
    }
    return flat;
  }
  // Map a colour word (incl. variants like "light blue", "grey") to a facelet letter.
  function colorToLetter(name) {
    if (!name) return null;
    var n = String(name).toLowerCase();
    if (n.indexOf('white') >= 0 || n.indexOf('grey') >= 0 || n.indexOf('gray') >= 0) return 'U';
    if (n.indexOf('yellow') >= 0) return 'D';
    if (n.indexOf('orange') >= 0) return 'L';
    if (n.indexOf('red') >= 0) return 'R';
    if (n.indexOf('green') >= 0) return 'F';
    if (n.indexOf('blue') >= 0) return 'B';
    return COLOR_TO_LETTER[n.trim()] || null;
  }
  function assignFace(letter, flat) {
    var d = [];
    for (var i = 0; i < 9; i++) d.push(colorToLetter(flat[i])); // centre included
    faceColors[letter] = d;
  }

  function applySingle(content, letter) {
    var obj = parseJSON(content); if (!obj) return false;
    var flat = gridToFlat(obj.grid || obj.colors || obj);
    if (!flat) return false;
    assignFace(letter, flat);
    renderStep();
    return true;
  }

  // ---- assemble ----
  function finishWizard() {
    if (!allComplete()) return;
    var arr = new Array(54);
    ['U', 'R', 'F', 'D', 'L', 'B'].forEach(function (letter) {
      var base = FACE_BASE[letter], d = faceColors[letter];
      for (var i = 0; i < 9; i++) arr[base + i] = d[i];
    });
    var str = arr.join('');
    close();
    if (applyState) applyState(str);
  }

  global.PhotoWizard = { init: init, open: open };
})(window);
