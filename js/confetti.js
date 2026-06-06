/* Tiny dependency-free confetti burst for the "You did it!" celebration. */
(function (global) {
  'use strict';

  let canvas, ctx, pieces = [], raf = null;
  const COLORS = ['#ff5d8f', '#ffd23f', '#3ddc97', '#4f8cff', '#ff8c42', '#b06cff', '#ff4d4d'];

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
  }

  function spawn(n) {
    const cx = canvas.width / 2;
    for (let i = 0; i < n; i++) {
      pieces.push({
        x: cx + (Math.random() - 0.5) * canvas.width * 0.4,
        y: canvas.height * 0.28 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 11,
        vy: Math.random() * -11 - 4,
        g: 0.22 + Math.random() * 0.1,
        size: 7 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
        ttl: 120 + Math.random() * 60,
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.life++;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rot += p.vr;
      const alpha = Math.max(0, 1 - p.life / p.ttl);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    pieces = pieces.filter((p) => p.life < p.ttl && p.y < canvas.height + 40);
    if (pieces.length) {
      raf = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      raf = null;
    }
  }

  function celebrate() {
    ensureCanvas();
    spawn(160);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  global.celebrate = celebrate;
})(window);
