/* Cubie — the cute animated cube mascot.
   Lives in the corner, blinks, reacts to app events, and repeats status
   messages in a speech bubble. Exposes window.Cubie. */
(function () {
  'use strict';

  var MOUTHS = {
    idle:  'M38 62 Q50 70 62 62',                 // gentle smile
    happy: 'M36 60 Q50 76 64 60',                 // big smile
    cheer: 'M36 58 Q50 80 64 58 Q50 70 36 58',    // open grin
    think: 'M41 65 L59 65',                       // flat hmm
    sad:   'M38 68 Q50 58 62 68'                  // frown
  };

  var root, bubble, mouth, bubbleTimer, moodTimer, lastMsg = '', lastKind = '';

  function build() {
    root = document.createElement('div');
    root.className = 'cubie';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', 'Cubie the cube mascot');
    root.innerHTML =
      '<div class="cubie-bubble" id="cubieBubble"></div>' +
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '  <g class="cubie-body">' +
      '    <rect x="10" y="14" width="80" height="80" rx="20" fill="#8b5cf6"/>' +
      '    <rect x="10" y="14" width="80" height="80" rx="20" fill="url(#cubieShine)"/>' +
      // little coloured stickers on the "hat" edge
      '    <rect x="22" y="6"  width="14" height="14" rx="4" fill="#ff5d9e" transform="rotate(-8 29 13)"/>' +
      '    <rect x="43" y="2"  width="14" height="14" rx="4" fill="#ffd23f" transform="rotate(5 50 9)"/>' +
      '    <rect x="64" y="6"  width="14" height="14" rx="4" fill="#1fc77b" transform="rotate(10 71 13)"/>' +
      // face panel
      '    <rect x="18" y="26" width="64" height="56" rx="14" fill="#f7f2ff"/>' +
      // eyes
      '    <circle cx="37" cy="46" r="8" fill="#2c2566"/>' +
      '    <circle cx="63" cy="46" r="8" fill="#2c2566"/>' +
      '    <circle class="cubie-pupil" cx="39.5" cy="43.5" r="2.6" fill="#fff"/>' +
      '    <circle class="cubie-pupil" cx="65.5" cy="43.5" r="2.6" fill="#fff"/>' +
      // eyelids (revealed during blink)
      '    <rect class="eyelid" x="28" y="37" width="18" height="18" rx="9" fill="#f7f2ff"/>' +
      '    <rect class="eyelid" x="54" y="37" width="18" height="18" rx="9" fill="#f7f2ff"/>' +
      // blush
      '    <circle cx="27" cy="58" r="4.5" fill="#ffb3d4" opacity="0.8"/>' +
      '    <circle cx="73" cy="58" r="4.5" fill="#ffb3d4" opacity="0.8"/>' +
      // mouth
      '    <path class="cubie-mouth" d="' + MOUTHS.idle + '" fill="none" stroke="#2c2566" stroke-width="3.5" stroke-linecap="round"/>' +
      '  </g>' +
      '  <defs>' +
      '    <linearGradient id="cubieShine" x1="0" y1="0" x2="0" y2="1">' +
      '      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>' +
      '      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>' +
      '    </linearGradient>' +
      '  </defs>' +
      '</svg>';
    document.body.appendChild(root);
    bubble = root.querySelector('.cubie-bubble');
    mouth = root.querySelector('.cubie-mouth');
    root.addEventListener('click', function () {
      setMood('wiggle', 700);
      if (lastMsg) say(lastMsg, lastKind);
      else say('Hi! I’m Cubie! Mix the cube and I’ll help you solve it! 🧩');
    });
  }

  function setMood(m, holdMs) {
    if (!root) return;
    clearTimeout(moodTimer);
    root.className = 'cubie' + (m && m !== 'idle' ? ' m-' + m : '');
    if (mouth) mouth.setAttribute('d', MOUTHS[m] || MOUTHS.idle);
    if (holdMs) moodTimer = setTimeout(function () { setMood('idle'); }, holdMs);
  }

  function say(text, kind, holdMs) {
    if (!root || !text) return;
    lastMsg = text; lastKind = kind || '';
    bubble.textContent = text;
    bubble.className = 'cubie-bubble show ' + (kind || '');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      bubble.classList.remove('show');
    }, holdMs || (kind === 'err' ? 7000 : 4500));
  }

  // Map app status messages to moods. Called from app.js setStatus().
  function onStatus(text, kind) {
    if (!root) return;
    if (kind === 'err') { setMood('sad', 2500); say(text, 'err'); return; }
    if (/solving|thinking|loading/i.test(text)) { setMood('think'); say(text, ''); return; }
    if (/solved|great job|did it/i.test(text)) { return; } // cheer() handles wins
    if (kind === 'ok') { setMood('happy', 1800); say(text, 'ok'); return; }
    setMood('idle');
    say(text, '');
  }

  function cheer() {
    setMood('cheer', 2600);
    say('🎉 Woohoo! You did it! You’re a cube wizard! 🪄', 'ok', 6000);
  }

  function wiggle() { setMood('wiggle', 700); }
  function think() { setMood('think'); }

  function init() { if (!root) build(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Cubie = { say: say, setMood: setMood, onStatus: onStatus, cheer: cheer, wiggle: wiggle, think: think };
})();
