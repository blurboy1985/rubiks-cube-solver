/* Main app: state, 2D net editor, solver worker, and solution playback. */
(function () {
  'use strict';

  const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  const BLANK = 'U'.repeat(54); // all-white starting canvas
  const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE_LABELS = { U: 'White', R: 'Red', F: 'Green', D: 'Yellow', L: 'Orange', B: 'Blue' };
  const FACE_NAMES = { U: 'Up (top)', R: 'Right', F: 'Front', D: 'Down (bottom)', L: 'Left', B: 'Back' };
  const CENTER_IDX = [4, 13, 22, 31, 40, 49]; // centre sticker of each face (U R F D L B order)
  const CENTER = { 4: 'U', 13: 'R', 22: 'F', 31: 'D', 40: 'L', 49: 'B' };

  // ---- state ----
  let facelets = BLANK;         // current displayed state
  let baseState = SOLVED;       // state at moment of solve (for playback)
  let solution = [];            // array of moves
  let stepIndex = 0;            // playback position (0..solution.length)
  let playing = false;
  let rewinding = false;
  let playTimer = null;
  let endCelebrated = false;
  let paintMode = true;
  let paintColor = 'U';
  let solverReady = false;
  let solveId = 0;

  // ---- worker ----
  const worker = new Worker('js/solver-worker.js');
  worker.onmessage = function (e) {
    const m = e.data;
    if (m.type === 'ready') {
      solverReady = true;
      el('solveBtn').disabled = false;
      setStatus('Ready — paint your cube, then press Solve', 'ok');
    } else if (m.type === 'solution') {
      onSolution(m.solution);
    } else if (m.type === 'error') {
      setStatus('Solver error: ' + m.error, 'err');
      setBusy(false);
    }
  };
  worker.postMessage({ type: 'init' });

  // ---- dom helpers ----
  function el(id) { return document.getElementById(id); }
  function setStatus(text, kind) {
    const s = el('status');
    s.textContent = text;
    s.className = 'status ' + (kind || '');
  }

  // ---- net editor ----
  // Layout positions (gridRow, gridCol of faces in a 12x9 cross of stickers).
  const FACE_POS = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
  const FACE_BASE = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };

  function buildNet() {
    const net = el('net');
    net.innerHTML = '';
    for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const [gr, gc] = FACE_POS[face];
      const base = FACE_BASE[face];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const idx = base + r * 3 + c;
          const cell = document.createElement('div');
          cell.className = 'sticker';
          cell.dataset.idx = idx;
          cell.style.gridRow = (gr + r + 1);
          cell.style.gridColumn = (gc + c + 1);
          cell.addEventListener('click', () => onStickerClick(idx));
          net.appendChild(cell);
        }
      }
    }
    paintNet();
  }

  function paintNet() {
    const colors = window.Cube3D.COLORS;
    for (const cell of el('net').children) {
      const idx = +cell.dataset.idx;
      const letter = facelets[idx];
      cell.style.background = colors[letter];
      cell.classList.toggle('center', idx in CENTER);
    }
  }

  function onStickerClick(idx) {
    if (!paintMode) return;
    paintSticker(idx);
  }

  // Paint a single facelet (used by both the 2D net and the 3D cube).
  function paintSticker(idx) {
    const arr = facelets.split('');
    arr[idx] = paintColor;
    facelets = arr.join('');
    paintNet();
    window.Cube3D.setState(facelets);
    clearSolution();
  }

  // ---- rendering ----
  function render() {
    paintNet();
    window.Cube3D.setState(facelets);
  }

  // ---- moves / scramble ----
  function applyMoves(str) {
    const cube = Cube.fromString(facelets);
    cube.move(str);
    facelets = cube.asString();
  }

  function scramble() {
    stopPlay();
    clearSolution();
    if (paintMode) togglePaint(); // leave paint mode; show a clean solvable cube
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const suff = ['', "'", '2'];
    const moves = [];
    let last = '';
    for (let i = 0; i < 25; i++) {
      let f;
      do { f = faces[(Math.random() * 6) | 0]; } while (f === last);
      last = f;
      moves.push(f + suff[(Math.random() * 3) | 0]);
    }
    const seq = moves.join(' ');
    facelets = SOLVED;          // always scramble from a solved cube
    applyMoves(seq);
    el('scrambleText').textContent = seq;
    render();
    setStatus('Scrambled — press Solve', '');
  }

  function reset() {
    stopPlay();
    clearSolution();
    facelets = BLANK;
    el('scrambleText').textContent = '—';
    render();
    if (!paintMode) togglePaint();
    else setStatus('Cleared — paint your cube', '');
  }

  // ---- colour normalisation ----
  // cube.js (Kociemba) assumes a fixed scheme: the cube is held so that the
  // White centre is Up, Yellow is Down, etc. But people paint a scrambled cube
  // in whatever orientation it happens to be in, so the centre colours rarely
  // line up with that assumption. We read the six centres to learn which colour
  // belongs on which face, then relabel every sticker into the canonical
  // U/R/F/D/L/B scheme before handing the state to cube.js. This is a pure
  // renaming of colours (positions are untouched), so any solution we get back
  // applies unchanged to the cube as painted.
  function centerRemap(str) {
    const map = {};
    CENTER_IDX.forEach((idx, face) => { map[str[idx]] = LETTERS[face]; });
    return map;
  }
  function relabel(str, map) {
    let out = '';
    for (const ch of str) out += (map[ch] || ch);
    return out;
  }
  function invertMap(map) {
    const inv = {};
    for (const k in map) inv[map[k]] = k;
    return inv;
  }
  // Canonicalise a painted state so its centres read U R F D L B.
  function normalize(str) {
    return relabel(str, centerRemap(str));
  }

  // ---- validation ----
  function validate(str) {
    const counts = {};
    for (const ch of str) counts[ch] = (counts[ch] || 0) + 1;
    for (const L of LETTERS)
      if (counts[L] !== 9) return 'Each colour must appear exactly 9 times (' + FACE_LABELS[L] + ': ' + (counts[L] || 0) + ').';
    const centers = CENTER_IDX.map((i) => str[i]);
    if (new Set(centers).size !== 6) return 'The 6 centre stickers must each be a different colour.';
    try {
      // Validate in the canonical scheme so the check is independent of how the
      // cube was oriented while painting.
      const norm = normalize(str);
      const round = Cube.fromString(norm).asString();
      if (round !== norm) return 'That sticker arrangement is not a valid cube state.';
    } catch (err) {
      return 'That sticker arrangement is not a valid cube state.';
    }
    return null;
  }

  // ---- solve ----
  function requestSolve() {
    stopPlay();
    if (facelets === SOLVED) { setStatus('Already solved!', 'ok'); return; }
    const err = validate(facelets);
    if (err) { setStatus(err, 'err'); return; }
    if (!solverReady) { setStatus('Solver still loading…', ''); return; }
    setBusy(true);
    setStatus('Solving…', '');
    baseState = facelets;             // keep painted colours for display/playback
    solveId++;
    // Solve in the canonical scheme; the move list is position-based, so it
    // applies just as well to the painted (possibly re-oriented) cube.
    worker.postMessage({ type: 'solve', facelets: normalize(facelets), id: solveId });
  }

  function onSolution(sol) {
    setBusy(false);
    sol = (sol || '').trim();
    solution = sol.length ? sol.split(/\s+/) : [];
    stepIndex = 0;
    facelets = baseState;
    render();
    renderSolutionList();
    if (solution.length === 0) {
      setStatus('Already solved!', 'ok');
    } else {
      setStatus('Solution found: ' + solution.length + ' moves', 'ok');
    }
    updatePlaybackButtons();
  }

  function clearSolution() {
    solution = [];
    stepIndex = 0;
    el('moves').innerHTML = '';
    el('moveCount').textContent = '';
    updateInstruction();
    updatePlaybackButtons();
  }

  function renderSolutionList() {
    const box = el('moves');
    box.innerHTML = '';
    solution.forEach((mv, i) => {
      const span = document.createElement('span');
      span.className = 'move';
      span.textContent = mv;
      span.addEventListener('click', () => seekTo(i));
      box.appendChild(span);
    });
    el('moveCount').textContent = solution.length ? '(' + solution.length + ' moves)' : '';
    highlightMove();
  }

  function highlightMove() {
    const kids = el('moves').children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('done', i < stepIndex);
      kids[i].classList.toggle('current', i === stepIndex);
    }
    updateInstruction();
  }

  // Kid-friendly instruction for one move, e.g. "R'", "F2".
  function describe(move) {
    const face = move[0];
    const name = FACE_NAMES[face];
    const colorName = FACE_LABELS[face];
    const dot = '<span class="dot" style="background:' + window.Cube3D.COLORS[face] + '"></span>';
    let dir;
    if (move.indexOf('2') >= 0) dir = 'spin it ↻↻ <b>two times</b> (a big half turn)';
    else if (move.indexOf("'") >= 0) dir = 'spin it ↺ <b>this way</b> (anti-clockwise)';
    else dir = 'spin it ↻ <b>that way</b> (clockwise)';
    return dot + ' Find the <b>' + name + '</b> side (' + colorName +
      ' middle) and ' + dir + '!';
  }

  function updateInstruction() {
    const box = el('instruction');
    if (!box) return;
    if (!solution.length) { box.innerHTML = ''; box.classList.remove('show'); return; }
    box.classList.add('show');
    if (stepIndex >= solution.length) {
      box.innerHTML = '<span class="step-num">🏆 Done!</span> Woohoo! The cube is solved! You\'re a cube wizard! 🪄✨';
      return;
    }
    const mv = solution[stepIndex];
    box.innerHTML = '<span class="step-num">Step ' + (stepIndex + 1) + ' / ' +
      solution.length + '</span> <code>' + mv + '</code> — ' + describe(mv);
  }

  // ---- playback ----
  function stateAt(n) {
    // Run the move maths in the canonical scheme (cube.js can't parse a
    // re-oriented cube), then map the colours back so the user sees the cube
    // in the colours they painted.
    const map = centerRemap(baseState);
    const cube = Cube.fromString(relabel(baseState, map));
    if (n > 0) cube.move(solution.slice(0, n).join(' '));
    return relabel(cube.asString(), invertMap(map));
  }

  function stepForward(animated) {
    if (stepIndex >= solution.length) return;
    const mv = solution[stepIndex];
    const after = stateAt(stepIndex + 1);
    const finish = () => {
      stepIndex++;
      facelets = after;
      render();
      highlightMove();
      updatePlaybackButtons();
      if (playing) {
        if (stepIndex < solution.length) {
          playTimer = setTimeout(() => stepForward(true), 60);
        } else {
          stopPlay();
        }
      }
    };
    if (animated) {
      window.Cube3D.animateMove(mv, speed(), finish);
    } else {
      finish();
    }
  }

  // Inverse of a single move (for animating backwards).
  function invertMove(mv) {
    const f = mv[0];
    if (mv.indexOf('2') >= 0) return mv;       // half turn is its own inverse
    if (mv.indexOf("'") >= 0) return f;        // ccw -> cw
    return f + "'";                            // cw -> ccw
  }

  function stepBack(animated) {
    if (stepIndex <= 0) { if (rewinding) stopPlay(); return; }
    const inv = invertMove(solution[stepIndex - 1]);
    const after = stateAt(stepIndex - 1);
    const finish = () => {
      stepIndex--;
      facelets = after;
      render();
      highlightMove();
      updatePlaybackButtons();
      if (rewinding) {
        if (stepIndex > 0) {
          playTimer = setTimeout(() => stepBack(true), 60);
        } else {
          stopPlay();
          setStatus('Back at the start', '');
        }
      }
    };
    if (animated) {
      window.Cube3D.animateMove(inv, speed(), finish);
    } else {
      finish();
    }
  }

  // Rewind: animate backwards through every move to the start.
  function rewind() {
    if (!solution.length || stepIndex <= 0) return;
    stopPlay();
    rewinding = true;
    el('firstBtn').classList.add('active');
    stepBack(true);
  }

  function seekTo(i) {
    stopPlay();
    stepIndex = Math.max(0, Math.min(solution.length, i));
    facelets = stateAt(stepIndex);
    render();
    highlightMove();
    updatePlaybackButtons();
  }

  function play() {
    if (!solution.length) return;
    if (stepIndex >= solution.length) seekTo(0);
    playing = true;
    el('playBtn').textContent = '⏸ Pause';
    stepForward(true);
  }

  function stopPlay() {
    playing = false;
    rewinding = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    const b = el('playBtn');
    if (b) b.textContent = '▶ Play';
    const f = el('firstBtn');
    if (f) f.classList.remove('active');
  }

  function togglePlay() {
    if (playing) stopPlay();
    else play();
  }

  function speed() {
    const v = +el('speed').value; // 1 (slow) .. 5 (fast)
    return ({ 1: 600, 2: 420, 3: 280, 4: 170, 5: 90 })[v] || 280;
  }

  function updatePlaybackButtons() {
    const has = solution.length > 0;
    el('firstBtn').disabled = !has || stepIndex === 0;
    el('prevBtn').disabled = !has || stepIndex === 0;
    el('playBtn').disabled = !has;
    el('nextBtn').disabled = !has || stepIndex >= solution.length;
    el('lastBtn').disabled = !has || stepIndex >= solution.length;
    maybeCelebrate();
  }

  // Fire confetti + banner once, when the cube reaches the solved end state.
  function maybeCelebrate() {
    if (solution.length && stepIndex >= solution.length) {
      if (!endCelebrated) {
        endCelebrated = true;
        if (typeof window.celebrate === 'function') window.celebrate();
        const banner = el('celebrate');
        if (banner) {
          banner.classList.add('show');
          setTimeout(() => banner.classList.remove('show'), 2600);
        }
        setStatus('🎉 Solved! Great job!', 'ok');
      }
    } else {
      endCelebrated = false;
    }
  }

  function setBusy(b) {
    el('solveBtn').disabled = b || !solverReady;
    el('scrambleBtn').disabled = b;
    el('resetBtn').disabled = b;
  }

  // ---- paint mode ----
  function buildPalette() {
    const pal = el('palette');
    const colors = window.Cube3D.COLORS;
    LETTERS.forEach((L) => {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = colors[L];
      sw.title = FACE_LABELS[L];
      sw.dataset.letter = L;
      sw.addEventListener('click', () => {
        paintColor = L;
        for (const c of pal.children) c.classList.toggle('sel', c.dataset.letter === L);
      });
      pal.appendChild(sw);
    });
    pal.firstChild.classList.add('sel');
  }

  function togglePaint() {
    paintMode = !paintMode;
    stopPlay();
    window.Cube3D.setPaintMode(paintMode);
    el('paintBtn').classList.toggle('active', paintMode);
    el('palette').style.display = paintMode ? 'flex' : 'none';
    el('paintHint').style.display = paintMode ? 'block' : 'none';
    document.body.classList.toggle('painting', paintMode);
    if (paintMode) {
      clearSolution();
      setStatus('Paint mode: click stickers on the cube or the net', '');
    } else {
      const err = validate(facelets);
      setStatus(err ? err : 'Looks valid — press Solve', err ? 'err' : 'ok');
    }
  }

  // ---- wire up ----
  function init() {
    window.Cube3D.init(el('cube3d'));
    window.Cube3D.setOnPaint(paintSticker); // click stickers on the 3D cube
    buildNet();
    buildPalette();
    window.Cube3D.setState(facelets);

    el('scrambleBtn').addEventListener('click', scramble);
    el('resetBtn').addEventListener('click', reset);
    el('solveBtn').addEventListener('click', requestSolve);
    el('solveBtn').disabled = true;
    el('paintBtn').addEventListener('click', togglePaint);

    el('firstBtn').addEventListener('click', rewind);
    el('prevBtn').addEventListener('click', () => { stopPlay(); stepBack(true); });
    el('playBtn').addEventListener('click', togglePlay);
    el('nextBtn').addEventListener('click', () => { stopPlay(); stepForward(true); });
    el('lastBtn').addEventListener('click', () => seekTo(solution.length));

    // Start in paint mode with the all-white cube.
    window.Cube3D.setPaintMode(true);
    el('paintBtn').classList.add('active');
    el('palette').style.display = 'flex';
    el('paintHint').style.display = 'block';
    document.body.classList.add('painting');

    updatePlaybackButtons();
    setStatus('Loading solver…', '');
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
