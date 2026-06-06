/* "Color Fun" — a no-fail color-by-number painting minigame for toddlers.
   Pick a colour, tap the big squares to fill in a happy picture. Matching a
   square sparkles; finishing the picture throws confetti and loads a new one. */
(function (global) {
  'use strict';

  const HEX = {
    R: '#ff4d4d', O: '#ff9f1c', Y: '#ffd23f', G: '#46c93a',
    B: '#4f8cff', P: '#a66cff', K: '#ff77c8', W: '#ffffff',
    X: '#353548', S: '#9fe0ff', N: '#a9744f',
  };
  const NAME = {
    R: 'red', O: 'orange', Y: 'yellow', G: 'green', B: 'blue',
    P: 'purple', K: 'pink', W: 'white', X: 'black', S: 'sky blue', N: 'brown',
  };
  const ORDER = ['R', 'O', 'Y', 'G', 'B', 'P', 'K', 'W', 'X', 'N', 'S'];

  // Each picture: every cell has a target colour (background included), so the
  // whole board gets coloured in. Grids are rows of single-letter colours.
  const PICTURES = [
    {
      name: 'a Heart', emoji: '❤️',
      grid: [
        'WRRWRRW',
        'RRRRRRR',
        'RRRRRRR',
        'WRRRRRW',
        'WWRRRWW',
        'WWWRWWW',
      ],
    },
    {
      name: 'a Smiley', emoji: '😊',
      grid: [
        'SYYYYYS',
        'YYXYXYY',
        'YYYYYYY',
        'YXYYYXY',
        'YYXXXYY',
        'SYYYYYS',
      ],
    },
    {
      name: 'a Rainbow', emoji: '🌈',
      grid: [
        'RRRRRRR',
        'OOOOOOO',
        'YYYYYYY',
        'GGGGGGG',
        'BBBBBBB',
        'PPPPPPP',
      ],
    },
    {
      name: 'a Flower', emoji: '🌷',
      grid: [
        'SSKKKSS',
        'SKYYYKS',
        'SKYYYKS',
        'SSKGKSS',
        'SSSGSSS',
        'SGGGGGS',
      ],
    },
    {
      name: 'a Star', emoji: '⭐',
      grid: [
        'SSSYSSS',
        'SSYYYSS',
        'YYYYYYY',
        'SYYYYYS',
        'SYYYYYS',
        'SYSSSYS',
      ],
    },
    {
      name: 'a Fish', emoji: '🐠',
      grid: [
        'SSSSSSS',
        'SOOOOSX',
        'OOOOOXX',
        'OOOWOXX',
        'SOOOOSX',
        'SSSSSSS',
      ],
    },
  ];

  let picIndex = 0;
  let cols = 7, rows = 6;
  let targets = [];     // array of target letters
  let painted = [];     // array of painted letters or null
  let cells = [];       // DOM nodes
  let selected = 'R';
  let soundOn = true;
  let audio = null;
  let inited = false;

  function el(id) { return document.getElementById(id); }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // --- sound (gentle WebAudio blips) ---
  function ensureAudio() {
    if (!audio) {
      try { audio = new (global.AudioContext || global.webkitAudioContext)(); }
      catch (e) { audio = null; }
    }
    return audio;
  }
  function blip(freq, t0, dur) {
    if (!soundOn) return;
    const ac = ensureAudio();
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(ac.destination);
    const t = ac.currentTime + t0;
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function popSound() { blip(660, 0, 0.12); }
  function winSound() { [523, 659, 784, 1046].forEach((f, i) => blip(f, i * 0.12, 0.18)); }

  // --- palette ---
  function colorsInPicture() {
    const set = {};
    targets.forEach((c) => { set[c] = true; });
    return ORDER.filter((c) => set[c]);
  }

  function buildPalette() {
    const pal = el('gamePalette');
    pal.innerHTML = '';
    const list = colorsInPicture();
    selected = list[0];
    list.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'game-swatch';
      b.style.background = HEX[c];
      b.dataset.c = c;
      b.title = NAME[c];
      b.setAttribute('aria-label', NAME[c]);
      b.addEventListener('click', () => {
        selected = c;
        ensureAudio();
        for (const k of pal.children) k.classList.toggle('sel', k.dataset.c === c);
      });
      pal.appendChild(b);
    });
    if (pal.firstChild) pal.firstChild.classList.add('sel');
  }

  // --- board ---
  function loadPicture(i) {
    const pic = PICTURES[i];
    rows = pic.grid.length;
    cols = pic.grid[0].length;
    targets = pic.grid.join('').split('');
    painted = targets.map(() => null);

    el('gameTitle').innerHTML = 'Let’s colour ' + pic.name + '! ' + pic.emoji;

    const board = el('gameGrid');
    board.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    board.innerHTML = '';
    cells = [];
    targets.forEach((t, idx) => {
      const cell = document.createElement('button');
      cell.className = 'game-cell';
      cell.dataset.idx = idx;
      cell.style.background = hexToRgba(HEX[t], 0.16); // faint hint of target
      cell.addEventListener('click', () => onTap(idx));
      board.appendChild(cell);
      cells.push(cell);
    });
    buildPalette();
    updateProgress();
  }

  function onTap(idx) {
    ensureAudio();
    const cell = cells[idx];
    if (cell.classList.contains('done')) return; // already matched & locked
    painted[idx] = selected;
    cell.style.background = HEX[selected];
    cell.classList.toggle('on-white', selected === 'W');
    if (selected === targets[idx]) {
      cell.classList.add('done');
      cell.classList.remove('miss');
      sparkle(cell);
      popSound();
    } else {
      cell.classList.add('miss');
    }
    updateProgress();
    checkWin();
  }

  function sparkle(cell) {
    cell.classList.remove('pop');
    void cell.offsetWidth; // restart animation
    cell.classList.add('pop');
  }

  function matchCount() {
    let n = 0;
    for (let i = 0; i < targets.length; i++) if (painted[i] === targets[i]) n++;
    return n;
  }

  function updateProgress() {
    const done = matchCount(), total = targets.length;
    el('gameProgress').textContent = '🖍️ ' + done + ' / ' + total + ' squares coloured';
  }

  let winning = false;
  function checkWin() {
    if (winning) return;
    if (matchCount() === targets.length) {
      winning = true;
      const pic = PICTURES[picIndex];
      el('gameTitle').innerHTML = '🎉 You made ' + pic.name + '! ' + pic.emoji + ' 🎉';
      if (typeof global.celebrate === 'function') global.celebrate();
      winSound();
      setTimeout(() => {
        winning = false;
        picIndex = (picIndex + 1) % PICTURES.length;
        loadPicture(picIndex);
      }, 2200);
    }
  }

  function newPicture() {
    if (winning) return;
    picIndex = (picIndex + 1) % PICTURES.length;
    loadPicture(picIndex);
  }

  function startOver() {
    if (winning) return;
    loadPicture(picIndex);
  }

  function toggleSound() {
    soundOn = !soundOn;
    el('soundBtn').textContent = soundOn ? '🔊' : '🔇';
    if (soundOn) { ensureAudio(); popSound(); }
  }

  function init() {
    if (inited) return;
    inited = true;
    el('newPicBtn').addEventListener('click', newPicture);
    el('clearPicBtn').addEventListener('click', startOver);
    el('soundBtn').addEventListener('click', toggleSound);
    loadPicture(0);
  }

  global.ToddlerGame = { init };
})(window);
