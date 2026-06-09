/* Optional spoken narration (Web Speech API) for pre-readers: reads each
   solution step out loud as it appears. Off by default; the 🗣️ button
   toggles it and the choice persists. */
(function (global) {
  'use strict';

  var KEY = 'cube.speech';
  var on = false;
  try { on = localStorage.getItem(KEY) === 'on'; } catch (e) { /* ignore */ }
  var supported = 'speechSynthesis' in global;
  var lastText = '';

  function speak(text) {
    if (!on || !supported || !text) return;
    try {
      global.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1.15;
      global.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // Turn the instruction card's HTML into friendly speech
  // ("Step 3 of 18. Find the Up side, white middle, and spin it clockwise!").
  function instructionText(el) {
    var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/Step (\d+) \/ (\d+)/, 'Step $1 of $2.');
    t = t.replace(/[↻↺]+/g, '');
    t = t.replace(/\([^)]*\)/g, '');           // drop "(anti-clockwise)" etc.
    t = t.replace(/\b[URFDLB]'?2?\b\s*—?\s*/, ''); // drop the notation token
    return t;
  }

  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    var b = document.getElementById('speechToggle');
    if (b) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (on) speak('I will read the steps out loud!');
    else if (supported) { try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  }

  function init() {
    if (!supported) return; // no button if the browser can't speak
    var tabs = document.querySelector('.tabs');
    if (tabs && !document.getElementById('speechToggle')) {
      var b = document.createElement('button');
      b.id = 'speechToggle';
      b.className = 'tab tab-round' + (on ? ' active' : '');
      b.textContent = '🗣️';
      b.title = 'Read steps out loud';
      b.setAttribute('aria-label', 'Read steps out loud');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () { setOn(!on); });
      tabs.appendChild(b);
    }

    var box = document.getElementById('instruction');
    if (box && 'MutationObserver' in global) {
      new MutationObserver(function () {
        var t = instructionText(box);
        if (t && t !== lastText) {
          lastText = t;
          speak(t);
        }
      }).observe(box, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Speech = { speak: speak, isOn: function () { return on; } };
})(window);
