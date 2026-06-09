/* App-wide sound effects (WebAudio): soft pops on taps, a whoosh per cube
   turn, and a fanfare on wins. Adds a 🔊 toggle button; preference persists
   in localStorage. Exposes window.Sound. */
(function (global) {
  'use strict';

  var KEY = 'cube.sound';
  var on = true;
  var ac = null;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* storage off */ }

  function ctx() {
    if (!ac) {
      try { ac = new (global.AudioContext || global.webkitAudioContext)(); }
      catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, t0, dur, type, vol) {
    if (!on) return;
    var a = ctx();
    if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(a.destination);
    var t = a.currentTime + t0;
    g.gain.exponentialRampToValueAtTime(vol || 0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function sweep(f0, f1, dur, type, vol) {
    if (!on) return;
    var a = ctx();
    if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'triangle';
    g.gain.value = 0.0001;
    o.connect(g); g.connect(a.destination);
    var t = a.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function tap()  { tone(740, 0, 0.07, 'sine', 0.09); }
  function turn() { sweep(280, 760, 0.16, 'triangle', 0.07); }
  function win()  { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, i * 0.11, 0.2, 'sine', 0.16); }); }
  function no()   { tone(330, 0, 0.14, 'sine', 0.1); tone(262, 0.13, 0.2, 'sine', 0.1); }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    var b = document.getElementById('soundToggle');
    if (b) {
      b.textContent = on ? '🔊' : '🔇';
      b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    }
    if (on) tap();
  }
  function toggle() { setOn(!on); }
  function isOn() { return on; }

  function init() {
    // 🔊 toggle lives with the tabs.
    var tabs = document.querySelector('.tabs');
    if (tabs && !document.getElementById('soundToggle')) {
      var b = document.createElement('button');
      b.id = 'soundToggle';
      b.className = 'tab tab-round';
      b.textContent = on ? '🔊' : '🔇';
      b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
      b.addEventListener('click', toggle);
      tabs.appendChild(b);
    }

    // Soft pop on every button tap (Color Fun cells have their own sounds).
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b && !b.classList.contains('game-cell') && b.id !== 'soundToggle') tap();
    }, true);

    // Whoosh on every animated cube turn.
    if (global.Cube3D && global.Cube3D.animateMove) {
      var orig = global.Cube3D.animateMove;
      global.Cube3D.animateMove = function (mv, dur, cb) { turn(); return orig(mv, dur, cb); };
    }
    // Fanfare when Cubie celebrates.
    if (global.Cubie && global.Cubie.cheer) {
      var oc = global.Cubie.cheer;
      global.Cubie.cheer = function () { win(); return oc(); };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Sound = { tap: tap, turn: turn, win: win, no: no, toggle: toggle, isOn: isOn };
})(window);
