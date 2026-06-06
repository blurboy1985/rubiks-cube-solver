/* Main app: state, 2D net editor, solver worker, and solution playback. */
(function () {
  'use strict';

  const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE_LABELS = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' };
  const CENTER = { 0: 'U', 9: 'R', 18: 'F', 27: 'D', 36: 'L', 45: 'B' };

  // ---- state ----
  let facelets = SOLVED;        // current displayed state
  let baseState = SOLVED;       // state at moment of solve (for playback)
  let solution = [];            // array of moves
  let stepIndex = 0;            // playback position (0..solution.length)
  let playing = false;
  let playTimer = null;
  let paintMode = false;
  let paintColor = 'U';
  let solverReady = false;
  let solveId = 0;

  // ---- worker ----
  const worker = new Worker('js/solver-worker.js');
  worker.onmessage = function (e) {
    const m = e.data;
    if (m.type === 'ready') {
      solverReady = true;
      setStatus('Solver ready', 'ok');
      el('solveBtn').disabled = false;
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
    if (idx in CENTER) return; // centers are fixed
    const arr = facelets.split('');
    arr[idx] = paintColor;
    facelets = arr.join('');
    paintNet();
    window.Cube3D.setState(facelets);
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
    applyMoves(seq);
    el('scrambleText').textContent = seq;
    render();
    setStatus('Scrambled — press Solve', '');
  }

  function reset() {
    stopPlay();
    clearSolution();
    facelets = SOLVED;
    el('scrambleText').textContent = '—';
    render();
    setStatus('Solved cube', 'ok');
  }

  // ---- validation ----
  function validate(str) {
    const counts = {};
    for (const ch of str) counts[ch] = (counts[ch] || 0) + 1;
    for (const L of LETTERS)
      if (counts[L] !== 9) return 'Each colour must appear exactly 9 times (' + FACE_LABELS[L] + ': ' + (counts[L] || 0) + ').';
    try {
      const round = Cube.fromString(str).asString();
      if (round !== str) return 'That sticker arrangement is not a valid cube state.';
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
    baseState = facelets;
    solveId++;
    worker.postMessage({ type: 'solve', facelets: facelets, id: solveId });
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
  }

  // ---- playback ----
  function stateAt(n) {
    const cube = Cube.fromString(baseState);
    if (n > 0) cube.move(solution.slice(0, n).join(' '));
    return cube.asString();
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
          setStatus('Solved!', 'ok');
        }
      }
    };
    if (animated) {
      window.Cube3D.animateMove(mv, speed(), finish);
    } else {
      finish();
    }
  }

  function stepBack() {
    if (stepIndex <= 0) return;
    stopPlay();
    stepIndex--;
    facelets = stateAt(stepIndex);
    render();
    highlightMove();
    updatePlaybackButtons();
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
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    const b = el('playBtn');
    if (b) b.textContent = '▶ Play';
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
    el('paintBtn').classList.toggle('active', paintMode);
    el('palette').style.display = paintMode ? 'flex' : 'none';
    el('paintHint').style.display = paintMode ? 'block' : 'none';
    document.body.classList.toggle('painting', paintMode);
    if (paintMode) {
      clearSolution();
      setStatus('Paint mode: click stickers to set colours', '');
    } else {
      const err = validate(facelets);
      setStatus(err ? err : 'Edits applied', err ? 'err' : 'ok');
    }
  }

  // ---- wire up ----
  function init() {
    window.Cube3D.init(el('cube3d'));
    buildNet();
    buildPalette();
    window.Cube3D.setState(facelets);

    el('scrambleBtn').addEventListener('click', scramble);
    el('resetBtn').addEventListener('click', reset);
    el('solveBtn').addEventListener('click', requestSolve);
    el('solveBtn').disabled = true;
    el('paintBtn').addEventListener('click', togglePaint);

    el('firstBtn').addEventListener('click', () => seekTo(0));
    el('prevBtn').addEventListener('click', stepBack);
    el('playBtn').addEventListener('click', togglePlay);
    el('nextBtn').addEventListener('click', () => { stopPlay(); stepForward(true); });
    el('lastBtn').addEventListener('click', () => seekTo(solution.length));

    updatePlaybackButtons();
    setStatus('Loading solver…', '');
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
