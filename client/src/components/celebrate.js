// Праздничное конфетти при сдаче теста и завершении курса (лёгкое, без библиотек).
// При включённой в системе настройке «уменьшить движение» не показывается.
export function celebrate({ count = 140, duration = 2600 } = {}) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f5bea';
  const colors = [accent, '#f5b400', '#15935b', '#e0730b', '#c2408f', '#2878d6'];
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth; const h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // два залпа снизу-слева и снизу-справа
  const parts = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -60 : -120) + (Math.random() - 0.5) * 50;
    const speed = 9 + Math.random() * 9;
    return {
      x: left ? w * 0.12 : w * 0.88, y: h * 0.92,
      vx: Math.cos((angle * Math.PI) / 180) * speed, vy: Math.sin((angle * Math.PI) / 180) * speed,
      size: 6 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length], shape: Math.random() > 0.5 ? 'rect' : 'circle',
    };
  });
  const start = performance.now();
  const frame = (t) => {
    const k = (t - start) / duration;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.28; p.vx *= 0.99; p.vy *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
}
