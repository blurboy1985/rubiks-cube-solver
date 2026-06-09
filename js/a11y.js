/* Colour-blind support: the 🔤 button overlays a letter on every net sticker
   and palette swatch (W/R/G/Y/O/B) so colours can be told apart by shape.
   Persisted in localStorage. */
(function (global) {
  'use strict';

  var KEY = 'cube.letters';
  var on = false;
  try { on = localStorage.getItem(KEY) === 'on'; } catch (e) { /* ignore */ }

  function setOn(v) {
    on = !!v;
    document.body.classList.toggle('letters', on);
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    var b = document.getElementById('lettersToggle');
    if (b) {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function init() {
    var tabs = document.querySelector('.tabs');
    if (tabs && !document.getElementById('lettersToggle')) {
      var b = document.createElement('button');
      b.id = 'lettersToggle';
      b.className = 'tab tab-round';
      b.textContent = '🔤';
      b.title = 'Show colour letters (colour-blind help)';
      b.setAttribute('aria-label', 'Show colour letters');
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { setOn(!on); });
      tabs.appendChild(b);
    }
    setOn(on); // restore saved choice
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.A11y = { lettersOn: function () { return on; } };
})(window);
