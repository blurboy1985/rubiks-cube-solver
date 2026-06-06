/* 3D Rubik's cube rendering + face-turn animation using vendored Three.js.
   Authoritative cube state lives elsewhere (cubejs facelet string); this module
   only draws a given facelet string and animates a single move at a time. */
(function (global) {
  'use strict';

  // Sticker colors per facelet letter (Western colour scheme).
  const COLORS = {
    U: '#fdfdfd', // white  (up)
    D: '#ffd500', // yellow (down)
    F: '#009b48', // green  (front)
    B: '#0046ad', // blue   (back)
    R: '#b71234', // red    (right)
    L: '#ff5800', // orange (left)
  };
  const PLASTIC = '#141414';

  // Box material index order in Three.js: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
  const MAT = { R: 0, L: 1, U: 2, D: 3, F: 4, B: 5 };

  // Build facelet-index -> {x,y,z,mat} map (standard URFDLB Kociemba layout).
  const FACELET_MAP = (function () {
    const map = new Array(54);
    function set(base, mat, posFn) {
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const p = posFn(r, c);
          map[base + r * 3 + c] = { x: p[0], y: p[1], z: p[2], mat: mat };
        }
    }
    set(0, MAT.U, (r, c) => [c - 1, 1, r - 1]);      // U (+y)
    set(9, MAT.R, (r, c) => [1, 1 - r, 1 - c]);      // R (+x)
    set(18, MAT.F, (r, c) => [c - 1, 1 - r, 1]);     // F (+z)
    set(27, MAT.D, (r, c) => [c - 1, -1, 1 - r]);    // D (-y)
    set(36, MAT.L, (r, c) => [-1, 1 - r, c - 1]);    // L (-x)
    set(45, MAT.B, (r, c) => [1 - c, 1 - r, -1]);    // B (-z)
    return map;
  })();

  // Reverse: "x,y,z,mat" -> facelet index (for picking stickers by ray).
  const REVERSE = (function () {
    const rev = {};
    for (let i = 0; i < 54; i++) {
      const f = FACELET_MAP[i];
      rev[f.x + ',' + f.y + ',' + f.z + ',' + f.mat] = i;
    }
    return rev;
  })();

  // Move -> {axis vector, layer coordinate, sign} (animation is cosmetic only).
  const MOVES = {
    U: { axis: 'y', layer: 1, sign: -1 },
    D: { axis: 'y', layer: -1, sign: 1 },
    R: { axis: 'x', layer: 1, sign: -1 },
    L: { axis: 'x', layer: -1, sign: 1 },
    F: { axis: 'z', layer: 1, sign: -1 },
    B: { axis: 'z', layer: -1, sign: 1 },
  };

  let THREE, renderer, scene, camera, cubeGroup;
  let cubies = [];            // 27 meshes
  let cubieByKey = {};        // "x,y,z" -> mesh (home grid position)
  let animating = false;
  let dragState = null;
  let rotX = -0.5, rotY = 0.6; // view orientation
  let raycaster, ndc;
  let paintMode = false;
  let onPaint = null;         // callback(faceletIndex) set by the app

  function key(x, y, z) { return x + ',' + y + ',' + z; }

  function init(container) {
    THREE = global.THREE;
    const w = container.clientWidth, h = container.clientHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 0, 9.5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(5, 8, 10);
    scene.add(dir);

    cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    const geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const mats = [];
          for (let i = 0; i < 6; i++)
            mats.push(new THREE.MeshLambertMaterial({ color: PLASTIC }));
          const mesh = new THREE.Mesh(geo, mats);
          mesh.position.set(x, y, z);
          mesh.userData.home = { x, y, z };
          cubeGroup.add(mesh);
          cubies.push(mesh);
          cubieByKey[key(x, y, z)] = mesh;
        }

    raycaster = new THREE.Raycaster();
    ndc = new THREE.Vector2();

    applyView();
    attachDrag(renderer.domElement);
    window.addEventListener('resize', () => resize(container));
    animate();
  }

  // Map a pointer event to the facelet index of the sticker under it (or -1).
  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cubies, false);
    if (!hits.length) return -1;
    const hit = hits[0];
    const h = hit.object.userData.home;
    const mat = hit.face.materialIndex;
    const idx = REVERSE[h.x + ',' + h.y + ',' + h.z + ',' + mat];
    return idx === undefined ? -1 : idx;
  }

  function resize(container) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function applyView() {
    cubeGroup.rotation.set(rotX, rotY, 0);
  }

  function attachDrag(dom) {
    function down(e) {
      const p = e.touches ? e.touches[0] : e;
      dragState = { x: p.clientX, y: p.clientY, ox: p.clientX, oy: p.clientY, moved: 0 };
    }
    function move(e) {
      if (!dragState) return;
      const p = e.touches ? e.touches[0] : e;
      rotY += (p.clientX - dragState.x) * 0.01;
      rotX += (p.clientY - dragState.y) * 0.01;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      dragState.moved += Math.abs(p.clientX - dragState.x) + Math.abs(p.clientY - dragState.y);
      dragState.x = p.clientX;
      dragState.y = p.clientY;
      applyView();
    }
    function up(e) {
      if (dragState && paintMode && onPaint && dragState.moved < 6 && !animating) {
        // A click (not a drag): paint the sticker under the pointer.
        const cx = dragState.ox, cy = dragState.oy;
        const idx = pick(cx, cy);
        if (idx >= 0) onPaint(idx);
      }
      dragState = null;
    }
    dom.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    dom.addEventListener('touchstart', down, { passive: true });
    dom.addEventListener('touchmove', move, { passive: true });
    dom.addEventListener('touchend', up);
  }

  function setPaintMode(on) { paintMode = !!on; }
  function setOnPaint(fn) { onPaint = fn; }

  // Paint every cubie from a 54-char facelet string and reset to home grid.
  function setState(facelets) {
    for (const m of cubies) {
      m.position.set(m.userData.home.x, m.userData.home.y, m.userData.home.z);
      m.rotation.set(0, 0, 0);
      for (let i = 0; i < 6; i++) m.material[i].color.set(PLASTIC);
    }
    for (let i = 0; i < 54; i++) {
      const f = FACELET_MAP[i];
      const mesh = cubieByKey[key(f.x, f.y, f.z)];
      mesh.material[f.mat].color.set(COLORS[facelets[i]]);
    }
  }

  // Animate one move (e.g. "R", "U'", "F2"). onDone() fires at the end.
  function animateMove(move, duration, onDone) {
    if (animating) { if (onDone) onDone(); return; }
    const face = move[0];
    const spec = MOVES[face];
    if (!spec) { if (onDone) onDone(); return; }
    let turns = 1, sign = spec.sign;
    if (move.indexOf('2') >= 0) turns = 2;
    if (move.indexOf("'") >= 0) sign = -sign;
    const total = sign * turns * (Math.PI / 2);

    const pivot = new THREE.Group();
    cubeGroup.add(pivot);
    const layer = cubies.filter((m) => Math.round(m.position[spec.axis]) === spec.layer);
    for (const m of layer) pivot.add(m); // reparent (keeps world transform)

    animating = true;
    const start = performance.now();
    const dur = duration * turns;
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pivot.rotation[spec.axis] = total * eased;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Detach cubies back to cubeGroup, then caller repaints from new state.
        for (const m of layer.slice()) cubeGroup.add(m);
        cubeGroup.remove(pivot);
        animating = false;
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function isAnimating() { return animating; }

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  global.Cube3D = { init, setState, animateMove, isAnimating, setPaintMode, setOnPaint, COLORS };
})(window);
