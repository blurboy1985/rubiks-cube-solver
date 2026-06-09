/* Toddler Mode: a parent-gated toggle (press and hold the 🧸 button for 1.5s)
   that strips the solver down to Mix / Solve / Play with extra-big buttons,
   auto-plays solutions slowly, and lets Cubie do the talking. */
(function (global) {
  'use strict';

  var KEY = 'cube.kidmode';
  var HOLD_MS = 1500;
  var holdTimer = null;
  var active = false;

  function el(id) { return document.getElementById(id); }

  function say(msg, kind) { if (global.Cubie) global.Cubie.say(msg, kind || '', 5000); }

  function apply(onNow, silent) {
    active = !!onNow;
    document.body.classList.toggle('toddler', active);
    var b = el('kidModeBtn');
    if (b) {
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    try { localStorage.setItem(KEY, active ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (silent) return;
    if (active) {
      // Slow, watchable playback and a fresh mixed cube to start from.
      var speed = el('speed');
      if (speed) speed.value = '2';
      var scrambleBtn = el('scrambleBtn');
      if (scrambleBtn && !scrambleBtn.disabled) scrambleBtn.click();
      say('🧸 Toddler time! Press the big purple button to mix me up!');
    } else {
      say('Welcome back! All the grown-up buttons are here again.');
    }
  }

  function startHold(e) {
    e.preventDefault();
    var b = el('kidModeBtn');
    if (b) b.classList.add('holding');
    holdTimer = setTimeout(function () {
      holdTimer = null;
      if (b) b.classList.remove('holding');
      apply(!active);
    }, HOLD_MS);
  }

  function cancelHold() {
    var b = el('kidModeBtn');
    if (b) b.classList.remove('holding');
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      say('Ask a grown-up to press and hold the 🧸 button!', '');
    }
  }

  function init() {
    var tabs = document.querySelector('.tabs');
    if (tabs && !el('kidModeBtn')) {
      var b = document.createElement('button');
      b.id = 'kidModeBtn';
      b.className = 'tab tab-kid';
      b.innerHTML = '🧸 Toddler';
      b.title = 'Press and hold to switch Toddler Mode';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('pointerdown', startHold);
      b.addEventListener('pointerup', cancelHold);
      b.addEventListener('pointerleave', cancelHold);
      b.addEventListener('pointercancel', cancelHold);
      // block the synthetic click-tap sound double-firing the toggle
      b.addEventListener('click', function (e) { e.preventDefault(); });
      tabs.appendChild(b);
    }

    // Auto-play solutions in Toddler Mode: when the move list fills up, press
    // Play after a short beat so little ones just watch the magic.
    var moves = el('moves');
    if (moves && 'MutationObserver' in global) {
      new MutationObserver(function () {
        if (!active) return;
        if (!moves.children.length) return;
        var playBtn = el('playBtn');
        if (playBtn && !playBtn.disabled && playBtn.textContent.indexOf('Play') >= 0) {
          setTimeout(function () {
            if (active && !playBtn.disabled && playBtn.textContent.indexOf('Play') >= 0) playBtn.click();
          }, 700);
        }
      }).observe(moves, { childList: true });
    }

    // Restore last choice (silently — no scramble or chatter on load).
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    if (saved === 'on') apply(true, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.KidMode = { isOn: function () { return active; } };
})(window);
