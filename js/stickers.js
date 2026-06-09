/* Sticker book: every solved cube or finished Color Fun picture earns a
   random sticker. The collection lives in localStorage — no accounts, no
   failure states, just a growing pile of treasures. */
(function (global) {
  'use strict';

  var KEY = 'cube.stickers';
  var POOL = ['🦄', '🐬', '🚀', '🌟', '🍩', '🐱', '🐸', '🦖', '🌈', '⚽',
              '🎈', '🐼', '🦊', '🍓', '🎁', '🪐', '🐙', '🦋', '🍦', '🐢'];
  var earned = [];
  try { earned = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { earned = []; }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(earned)); } catch (e) { /* ignore */ }
  }

  function badge() {
    var b = document.getElementById('stickerBtn');
    if (b) b.innerHTML = '⭐ ' + earned.length;
  }

  function earn() {
    var s = POOL[(Math.random() * POOL.length) | 0];
    earned.push(s);
    save();
    badge();
    if (global.Cubie) global.Cubie.say('You earned a sticker! ' + s + ' It’s in your sticker book!', 'ok', 5000);
  }

  function openBook() {
    closeBook();
    var ov = document.createElement('div');
    ov.className = 'sb-overlay';
    ov.id = 'stickerBook';
    var grid = earned.length
      ? earned.map(function (s) { return '<span class="sb-sticker">' + s + '</span>'; }).join('')
      : '<p class="sb-empty">No stickers yet — solve a cube or finish a picture to earn one! 🧩</p>';
    ov.innerHTML =
      '<div class="sb-card" role="dialog" aria-label="Sticker book">' +
      '  <button class="sb-x" aria-label="Close">✕</button>' +
      '  <h2 class="sb-title">⭐ My sticker book</h2>' +
      '  <p class="sb-count">' + earned.length + ' sticker' + (earned.length === 1 ? '' : 's') + ' collected</p>' +
      '  <div class="sb-grid">' + grid + '</div>' +
      '</div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.classList.contains('sb-x')) closeBook();
    });
    document.body.appendChild(ov);
  }

  function closeBook() {
    var ov = document.getElementById('stickerBook');
    if (ov) ov.remove();
  }

  function init() {
    var tabs = document.querySelector('.tabs');
    if (tabs && !document.getElementById('stickerBtn')) {
      var b = document.createElement('button');
      b.id = 'stickerBtn';
      b.className = 'tab tab-round';
      b.setAttribute('aria-label', 'Open sticker book');
      b.addEventListener('click', openBook);
      tabs.appendChild(b);
      badge();
    }
    // Every celebration (solver win or Color Fun picture) earns a sticker.
    if (typeof global.celebrate === 'function') {
      var orig = global.celebrate;
      global.celebrate = function () { earn(); return orig.apply(this, arguments); };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Stickers = { earn: earn, open: openBook, count: function () { return earned.length; } };
})(window);
