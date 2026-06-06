/* Web Worker: builds the two-phase solver tables once, then solves states.
   Uses the vendored, MIT-licensed cubejs library (Kociemba two-phase). */
importScripts('../vendor/cube.js', '../vendor/solve.js');

let ready = false;

function ensureReady() {
  if (!ready) {
    Cube.initSolver();   // builds move/pruning tables (~a couple of seconds)
    ready = true;
  }
}

self.onmessage = function (e) {
  const msg = e.data || {};

  if (msg.type === 'init') {
    try {
      ensureReady();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
    return;
  }

  if (msg.type === 'solve') {
    try {
      ensureReady();
      const cube = Cube.fromString(msg.facelets);
      const solution = cube.solve(); // string of moves, e.g. "U R' F2 ..."
      self.postMessage({ type: 'solution', solution: solution, id: msg.id });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err), id: msg.id });
    }
    return;
  }
};
