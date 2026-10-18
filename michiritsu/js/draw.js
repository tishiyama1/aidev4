// 未知律 — drawing primitives shared by the board, the field notes and the end-of-run reveal.

export const INK = '#2a241c';
export const PAPER = '#efe6d2';
export const PAPER_DARK = '#e2d6bc';
export const PIGMENT = { red: '#b8432f', blue: '#2f4e7a', yellow: '#c9952b' };

export function drawShape(ctx, shape, cx, cy, r, fill, lw = 2) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  else if (shape === 'triangle') {
    ctx.moveTo(cx, cy - r * 0.92);
    ctx.lineTo(cx + r * 0.88, cy + r * 0.68);
    ctx.lineTo(cx - r * 0.88, cy + r * 0.68);
    ctx.closePath();
  } else if (shape === 'square') ctx.rect(cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44);
  else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.8, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.8, cy);
    ctx.closePath();
  }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function drawBeast(ctx, cx, cy, r, fill, t = 0, lw = 2) {
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.78 + 0.12 * Math.sin(a * 3 + t * 4));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.05, r * 0.34, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + Math.sin(t * 1.3) * r * 0.12, cy - r * 0.05, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
}

export function drawEntity(ctx, look, cx, cy, r, t = 0, lw = 2) {
  if (look.kind === 'beast') drawBeast(ctx, cx, cy, r, PIGMENT[look.color], t, lw);
  else drawShape(ctx, look.shape, cx, cy, r, PIGMENT[look.color], lw);
}

export function drawPlayer(ctx, cx, cy, r) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.35);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.85);
  ctx.lineTo(cx - r * 0.62, cy + r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.5, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // lantern
  ctx.beginPath();
  ctx.arc(cx + r * 0.62, cy + r * 0.2, r * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = '#f2c14e';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function drawFlame(ctx, cx, cy, r, t = 0) {
  const w = 1 + Math.sin(t * 9) * 0.06;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * w);
  ctx.quadraticCurveTo(cx + r * 0.7, cy - r * 0.1, cx + r * 0.45, cy + r * 0.5);
  ctx.quadraticCurveTo(cx, cy + r * 0.85, cx - r * 0.45, cy + r * 0.5);
  ctx.quadraticCurveTo(cx - r * 0.7, cy - r * 0.1, cx, cy - r * w);
  ctx.fillStyle = '#e9a23b';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.3, r * 0.18, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fbe7a1';
  ctx.fill();
}

export function drawHeart(ctx, cx, cy, r, full = true, broken = false) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.8);
  ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.6, cy - r * 1.1, cx, cy - r * 0.35);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.1, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.8);
  ctx.fillStyle = full ? '#9e2b25' : 'transparent';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (broken) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.35);
    ctx.lineTo(cx - r * 0.2, cy);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.25);
    ctx.lineTo(cx, cy + r * 0.8);
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

// A law's glyph: strokes on a 3x3 lattice, optionally cracked when the law has changed.
export function drawGlyph(ctx, glyph, cx, cy, size, color = INK, lw = 2.2, cracked = false) {
  const pt = i => [cx + ((i % 3) - 1) * size * 0.4, cy + (Math.floor(i / 3) - 1) * size * 0.4];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (const [a, b] of glyph) {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const i of new Set(glyph.flat())) {
    const [x, y] = pt(i);
    ctx.beginPath();
    ctx.arc(x, y, lw * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  if (cracked) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.5, cy - size * 0.45);
    ctx.lineTo(cx - size * 0.1, cy - size * 0.05);
    ctx.lineTo(cx - size * 0.2, cy + size * 0.1);
    ctx.lineTo(cx + size * 0.5, cy + size * 0.5);
    ctx.strokeStyle = '#9e2b25';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  }
}

function arrow(ctx, x1, y1, x2, y2, lw = 1.8) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.5) * 6, y2 - Math.sin(a - 0.5) * 6);
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a + 0.5) * 6, y2 - Math.sin(a + 0.5) * 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function ghost(ctx, cx, cy, r) {
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

// Pictograms for the reveal: what sets a law off, what it watches, what it does.
export function drawTrigger(ctx, trigger, cx, cy, s) {
  const r = s * 0.2;
  if (trigger.type === 'touch') {
    drawPlayer(ctx, cx - s * 0.28, cy, r);
    arrow(ctx, cx - s * 0.08, cy, cx + s * 0.12, cy);
    ghost(ctx, cx + s * 0.3, cy, r);
  } else if (trigger.type === 'adj') {
    drawPlayer(ctx, cx - s * 0.22, cy, r);
    ghost(ctx, cx + s * 0.22, cy, r);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, -0.6, 0.6);
    ctx.moveTo(cx - s * 0.42 * Math.cos(0.6), cy - s * 0.42 * Math.sin(0.6));
    ctx.arc(cx, cy, s * 0.42, Math.PI - 0.6, Math.PI + 0.6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (trigger.type === 'meet') {
    ghost(ctx, cx - s * 0.2, cy, r);
    ghost(ctx, cx + s * 0.2, cy, r);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 3, cy - s * 0.32 + Math.sin(a) * 3);
      ctx.lineTo(cx + Math.cos(a) * 7, cy - s * 0.32 + Math.sin(a) * 7);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (let i = 0; i < trigger.n; i++) {
      const a = (i / trigger.n) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.22, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }
}

export function drawSelector(ctx, sel, cx, cy, s) {
  if (sel.type === 'color') {
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = s * (0.3 + 0.06 * Math.sin(i * 2.7));
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = PIGMENT[sel.value];
    ctx.fill();
  } else {
    drawShape(ctx, sel.value, cx, cy, s * 0.32, PAPER_DARK, 1.8);
  }
}

export function drawEffect(ctx, effect, cx, cy, s) {
  const r = s * 0.22;
  switch (effect.type) {
    case 'recolor':
      drawSelector(ctx, { type: 'color', value: effect.value }, cx, cy, s);
      break;
    case 'reshape':
      drawShape(ctx, effect.value, cx, cy, s * 0.32, PAPER_DARK, 1.8);
      break;
    case 'repel':
      ghost(ctx, cx, cy, r * 0.7);
      arrow(ctx, cx + r, cy, cx + s * 0.45, cy);
      arrow(ctx, cx - r, cy, cx - s * 0.45, cy);
      break;
    case 'pull':
      ghost(ctx, cx, cy, r * 0.7);
      arrow(ctx, cx + s * 0.45, cy, cx + r, cy);
      arrow(ctx, cx - s * 0.45, cy, cx - r, cy);
      break;
    case 'swap':
      drawPlayer(ctx, cx - s * 0.25, cy, r * 0.8);
      ghost(ctx, cx + s * 0.25, cy, r * 0.8);
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    case 'split':
      ghost(ctx, cx - s * 0.18, cy, r * 0.8);
      ghost(ctx, cx + s * 0.18, cy, r * 0.8);
      ctx.beginPath();
      ctx.arc(cx - s * 0.18, cy, r * 0.8, -0.8, 0.8);
      ctx.stroke();
      break;
    case 'vanish':
      ghost(ctx, cx, cy, r);
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      break;
    case 'merge':
      ghost(ctx, cx - s * 0.3, cy, r * 0.6);
      ghost(ctx, cx + s * 0.3, cy, r * 0.6);
      arrow(ctx, cx - s * 0.18, cy, cx - 2, cy);
      arrow(ctx, cx + s * 0.18, cy, cx + 2, cy);
      break;
    case 'hurt':
      drawHeart(ctx, cx, cy, r, true, true);
      break;
    case 'light':
      drawFlame(ctx, cx, cy, r * 1.3);
      break;
  }
}
