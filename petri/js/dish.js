// シャーレ — the dish view.
// A WebGL fragment shader turns per-cell "presence" into watercolour-like colonies on lit agar.
// The simulation stays on its hex grid; the view interpolates presence so growth, predation and
// death read as continuous, organic motion. A 2D canvas renderer stands in when WebGL is missing.
import * as P from './sim.js';
import { PALETTE, INVADER, strainRGB, css } from './palette.js';

const T = 2 * P.R + 1; // texture side (13)
export const DISH_R = P.R * Math.sqrt(3) + 0.3; // dish radius in hex-position units (corner cells touch the wall)
const INV_SLOT = 9;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = (precision) => `
precision ${precision} float;
uniform sampler2D uCells;  // r: slot+1, g: presence, b: toxin, a: flash
uniform sampler2D uEnv;    // r: light/2, g: nutrient, b: antibiotic, a: bubble
uniform sampler2D uSlots;  // 16x4: colour / look1 / look2 / misc per slot
uniform vec2 uRes;
uniform float uUnit, uDishR, uTime, uMotion, uDesat, uGlow, uEnvIn;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// round dots on a jittered grid: scale = dots per unit, density 0..1, size = radius in cells
float dots(vec2 p, float scale, float density, float size, float seed){
  vec2 c = floor(p * scale);
  vec2 q = (c + 0.2 + 0.6 * vec2(hash(c + seed), hash(c + seed + 3.1))) / scale;
  float r = size * (0.6 + 0.6 * hash(c + seed + 7.7)) / scale;
  return (1.0 - smoothstep(r * 0.65, r, length(p - q))) * step(1.0 - density, hash(c + seed + 1.9));
}
float fbm(vec2 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 3.7) + 0.15 * vnoise(p * 4.3 + 9.1); }
vec4 mask4(float s, vec4 idx){ return vec4(1.0) - step(vec4(0.5), abs(vec4(s) - idx)); }
vec4 slotTex(float slot, float row){ return texture2D(uSlots, vec2((slot + 0.5) / 16.0, (row + 0.5) / 4.0)); }

void main(){
  vec2 p = (gl_FragCoord.xy - uRes * 0.5) / uUnit;
  p.y = -p.y;
  float rr = length(p);
  if (rr > uDishR + 0.75) { gl_FragColor = vec4(0.0); return; }

  // nearest hex (cube rounding)
  float r = p.y / 1.5;
  float q = p.x / 1.7320508 - r * 0.5;
  vec3 c = vec3(q, r, -q - r);
  vec3 rc = floor(c + 0.5);
  vec3 d = abs(rc - c);
  if (d.x > d.y && d.x > d.z) rc.x = -rc.y - rc.z; else if (d.y > d.z) rc.y = -rc.x - rc.z;

  vec4 wA = vec4(0.0), wB = vec4(0.0), wC = vec4(0.0);
  float light = 0.0, nut = 0.0, anti = 0.0, tox = 0.0, flash = 0.0, wsum = 0.0, bub = 0.0, bubRim = 0.0;
  vec2 bubC = vec2(0.0);
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      float fq = rc.x + float(i), fr = rc.y + float(j);
      if (abs(float(i + j)) > 2.0) continue;
      if (abs(fq) > 6.5 || abs(fr) > 6.5 || abs(fq + fr) > 6.5) continue;
      vec2 uv = (vec2(fq, fr) + 6.5) / 13.0;
      vec4 cell = texture2D(uCells, uv);
      vec4 env = texture2D(uEnv, uv);
      vec2 cp = vec2(1.7320508 * (fq + fr * 0.5), 1.5 * fr);
      vec2 dv = p - cp;
      float dd = dot(dv, dv);
      float slot = floor(cell.r * 255.0 + 0.5) - 1.0;
      if (slot > -0.5) {
        float w = cell.g * exp(-dd / 0.9);
        wA += w * mask4(slot, vec4(0.0, 1.0, 2.0, 3.0));
        wB += w * mask4(slot, vec4(4.0, 5.0, 6.0, 7.0));
        wC += w * mask4(slot, vec4(8.0, 9.0, 10.0, 11.0));
        flash = max(flash, cell.a * exp(-dd / 0.6));
      }
      float ge = exp(-dd / 2.4);
      light += ge * env.r; nut += ge * env.g; anti += ge * env.b; tox += ge * cell.b; wsum += ge;
      if (env.a > 0.5) {
        float dist = sqrt(dd);
        float inside = 1.0 - smoothstep(0.78, 0.86, dist);
        if (inside > bub) { bub = inside; bubC = dv; bubRim = smoothstep(0.55, 0.82, dist); }
      }
    }
  }
  light /= wsum; nut /= wsum; anti /= wsum; tox /= wsum;

  // ---- agar ----
  float lightMix = mix(0.5, light, uEnvIn);
  vec3 agar = mix(vec3(0.56, 0.45, 0.30), vec3(0.95, 0.84, 0.60), lightMix);
  agar += vec3(0.12, 0.08, 0.0) * smoothstep(0.7, 1.0, lightMix);
  float grain = fbm(p * 2.4);
  agar *= 0.93 + 0.12 * grain;
  agar *= 0.97 + 0.05 * vnoise(p * 14.0);
  // nutrient: clusters of brown grains
  float nm = smoothstep(0.25, 0.55, nut) * uEnvIn;
  // round grains scattered on a jittered grid
  vec2 gc = floor(p * 4.5);
  vec2 gp = (gc + 0.2 + 0.6 * vec2(hash(gc + 2.1), hash(gc + 5.7))) / 4.5;
  float gsz = 0.025 + 0.035 * hash(gc + 9.3);
  float gr = (1.0 - smoothstep(gsz * 0.7, gsz, length(p - gp))) * step(0.35, hash(gc + 1.1));
  agar = mix(agar, vec3(0.62, 0.48, 0.30), nm * 0.22);
  agar = mix(agar, vec3(0.36, 0.22, 0.10), nm * gr * 0.85);
  // antibiotic: pale crystalline streaks
  float am = smoothstep(0.3, 0.6, anti) * uEnvIn;
  float streak = smoothstep(0.55, 0.95, abs(sin(p.x * 3.1 + p.y * 1.7 + fbm(p * 1.3) * 5.0)));
  agar = mix(agar, vec3(0.80, 0.90, 0.95), am * (0.25 + 0.45 * streak));
  // toxin haze
  agar = mix(agar, vec3(0.42, 0.22, 0.46), smoothstep(0.08, 0.5, tox) * 0.55);

  // ---- colonies ----
  float best = 0.0, second = 0.0, bi = 0.0;
  ${[...Array(12)].map((_, k) => {
    const v = ['wA.x', 'wA.y', 'wA.z', 'wA.w', 'wB.x', 'wB.y', 'wB.z', 'wB.w', 'wC.x', 'wC.y', 'wC.z', 'wC.w'][k];
    return `if (${v} > best) { second = best; best = ${v}; bi = ${k}.0; } else if (${v} > second) { second = ${v}; }`;
  }).join('\n  ')}

  vec3 outc = agar;
  if (best > 0.03) {
    vec4 col4 = slotTex(bi, 0.0);
    vec4 l1 = slotTex(bi, 1.0);  // spiky, rim, toxic, photo
    vec4 l2 = slotTex(bi, 2.0);  // dormant, spore, grow, symbio
    vec3 col = col4.rgb;
    float invader = col4.a;
    float wob = 0.035 * sin(uTime * 1.1 + p.x * 1.9 + p.y * 1.4) * uMotion;
    float rag = l1.x * (vnoise(p * 3.6 + vec2(uTime * 0.15 * uMotion)) - 0.5) * 0.26;
    float th = 0.5 + wob + rag + invader * (fbm(p * 2.0 + uTime * 0.1 * uMotion) - 0.5) * 0.25;

    float aa = 0.05;
    float cover = smoothstep(th - aa, th + aa, best);
    // outside the edge: halo for fast growers, scattered spores, ink bleeding ahead of the invader
    vec3 halo = outc;
    halo = mix(halo, col, (0.08 + l2.z * 0.16) * smoothstep(th * 0.72, th, best)); // pigment bleeding into the agar
    vec2 sc = floor(p * 2.6);
    vec2 sp = (sc + vec2(hash(sc + 1.7), hash(sc + 8.3))) / 2.6;
    float spot = (1.0 - smoothstep(0.05, 0.085, length(p - sp))) * step(0.6, hash(sc + 4.4));
    halo = mix(halo, col * 0.75, l2.y * spot * smoothstep(0.1, 0.3, best));
    halo = mix(halo, col, invader * 0.4 * smoothstep(th * 0.4, th, best));

    // inside: a pigment wash, darker where pigment pools at the edge
    float inner = smoothstep(th, th + 0.5, best);
    float rimW = 0.09 + 0.2 * l1.y;
    float edge = 1.0 - smoothstep(th, th + rimW, best);
    // watercolour: a pale, uneven wash with granulation, darker where pigment dried at the edge,
    // and soft 'back-runs' where the wash pulled away
    float bloom = fbm(p * 0.9 + bi * 3.1);
    vec3 wash = mix(col, vec3(1.0, 0.97, 0.9), (0.16 + 0.22 * bloom) * (1.0 - invader));
    vec3 cc = mix(col * 0.8, wash, inner);
    float backrun = smoothstep(0.02, 0.0, abs(fbm(p * 1.1 + bi) - 0.52)) * inner;
    cc = mix(cc, col * 0.7, backrun * 0.35 * (1.0 - invader));
    cc = mix(cc, col * (0.32 + 0.1 * invader), edge * (0.65 + 0.3 * l1.y));
    float g2 = vnoise(p * 9.0 + bi * 7.0);
    cc *= 0.86 + 0.2 * fbm(p * 3.0 + bi * 5.0) + 0.06 * g2;
    // the invader is ink: slow clouds inside, a violet glow at its front
    float ink = fbm(p * 1.3 + vec2(uTime * 0.06, -uTime * 0.04) * uMotion);
    cc = mix(cc, mix(col * 0.55, col * 2.1, ink), invader * inner);
    cc += vec3(0.75, 0.35, 0.88) * edge * invader * 0.6;
    // trait textures
    cc = mix(cc, vec3(0.20, 0.05, 0.24), l1.z * dots(p, 3.0, 0.45, 0.32, 3.0) * inner * 0.9);
    cc = mix(cc, vec3(0.26, 0.54, 0.20), l1.w * dots(p, 4.2, 0.55, 0.26, 9.0) * inner * 0.85);
    if (l2.x > 0.5) {
      vec2 cy = fract(p * 1.4 + 0.3) - 0.5;
      cc = mix(cc, vec3(1.0, 1.0, 0.95), 0.45 * (1.0 - smoothstep(0.015, 0.05, abs(length(cy) - 0.2))) * inner);
    }
    // membrane where two colonies meet; symbiotic borders glow
    float mem = (1.0 - smoothstep(0.0, 0.16, best - second)) * step(th * 0.7, second);
    cc = mix(cc, col * 0.25, mem * 0.7);
    cc += vec3(1.0, 0.95, 0.75) * mem * l2.w * 0.45;
    cc += vec3(1.0, 0.95, 0.8) * flash * 0.45;
    outc = mix(halo, mix(halo, cc, 0.92), cover);
  }

  // ---- bubbles ----
  if (bub > 0.0) {
    vec3 glass = mix(outc * 1.12 + vec3(0.06, 0.07, 0.08), vec3(0.2, 0.18, 0.15), bubRim * 0.6);
    float hl = 1.0 - smoothstep(0.05, 0.2, length(bubC - vec2(-0.25, -0.28)));
    glass += vec3(1.0) * hl * 0.6;
    outc = mix(outc, glass, bub);
  }

  // ---- dish rim, vignette, glass ----
  outc *= 1.0 - 0.22 * smoothstep(uDishR * 0.5, uDishR, rr);
  float lum = dot(outc, vec3(0.3, 0.59, 0.11));
  outc = mix(outc, vec3(lum) * vec3(0.92, 0.95, 1.0), uDesat);
  outc += uGlow * vec3(0.16, 0.12, 0.04) * (1.0 - smoothstep(0.0, uDishR, rr) * 0.5);
  float inside = 1.0 - smoothstep(uDishR - 0.04, uDishR + 0.04, rr);
  float wall = smoothstep(uDishR - 0.05, uDishR + 0.05, rr) * (1.0 - smoothstep(uDishR + 0.55, uDishR + 0.75, rr));
  float ang = atan(p.y, p.x);
  float spec = pow(max(0.0, cos(ang + 2.3)), 6.0);
  vec3 wallC = vec3(0.85, 0.9, 0.92) * (0.35 + 0.65 * spec);
  float wallA = wall * (0.18 + 0.5 * spec);
  float innerShadow = smoothstep(uDishR - 0.6, uDishR, rr) * inside;
  outc *= 1.0 - innerShadow * 0.35;
  vec3 rgb = outc * inside + wallC * wallA;
  float alpha = inside + wallA * (1.0 - inside);
  gl_FragColor = vec4(rgb, alpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function makeTex(gl, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(w * h * 4));
  return t;
}

function glBackend(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG(hp && hp.precision > 0 ? 'highp' : 'mediump')));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn('dish shader unavailable, using 2D', e);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = { cells: makeTex(gl, T, T), env: makeTex(gl, T, T), slots: makeTex(gl, 16, 4) };
  const U = n => gl.getUniformLocation(prog, n);
  const u = { cells: U('uCells'), env: U('uEnv'), slots: U('uSlots'), res: U('uRes'), unit: U('uUnit'), dishR: U('uDishR'),
    time: U('uTime'), motion: U('uMotion'), desat: U('uDesat'), glow: U('uGlow'), envIn: U('uEnvIn') };
  const upload = (t, w, h, data, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  };
  return {
    kind: 'gl',
    draw(v) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      upload(tex.cells, T, T, v.cellData, 0);
      if (v.envDirty) { upload(tex.env, T, T, v.envData, 1); v.envDirty = false; }
      if (v.slotDirty) { upload(tex.slots, 16, 4, v.slotData, 2); v.slotDirty = false; }
      for (const [k, unit] of [['cells', 0], ['env', 1], ['slots', 2]]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex[k]);
        gl.uniform1i(u[k], unit);
      }
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.unit, v.unit * v.dpr);
      gl.uniform1f(u.dishR, DISH_R);
      gl.uniform1f(u.time, v.time);
      gl.uniform1f(u.motion, v.motion);
      gl.uniform1f(u.desat, v.desat);
      gl.uniform1f(u.glow, v.glow);
      gl.uniform1f(u.envIn, v.envIn);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// Plain canvas fallback: overlapping discs per strain with a darker rim.
function canvasBackend(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    kind: '2d',
    draw(v) {
      const s = canvas.width, dpr = v.dpr, u = v.unit * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, s, s);
      ctx.translate(s / 2, s / 2);
      const R = DISH_R * u;
      const g = ctx.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.1, 0, 0, R);
      g.addColorStop(0, '#f1dfb0'); g.addColorStop(1, '#b99a68');
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.save();
      ctx.clip();
      for (let i = 0; i < P.N; i++) {
        const [x, y] = P.pos(P.CELLS[i]);
        if (v.env.light[i] === 2) { ctx.fillStyle = 'rgba(255,220,140,0.22)'; ctx.beginPath(); ctx.arc(x * u, y * u, u * 1.1, 0, 7); ctx.fill(); }
        if (v.env.light[i] === 0) { ctx.fillStyle = 'rgba(60,40,20,0.14)'; ctx.beginPath(); ctx.arc(x * u, y * u, u * 1.1, 0, 7); ctx.fill(); }
        if (v.env.nutrient[i]) { ctx.fillStyle = 'rgba(110,70,35,0.5)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc((x + (k - 1) * 0.35) * u, (y + ((k * 7) % 3 - 1) * 0.3) * u, u * 0.09, 0, 7); ctx.fill(); } }
        if (v.env.anti[i]) { ctx.strokeStyle = 'rgba(190,225,240,0.8)'; ctx.lineWidth = u * 0.08; ctx.beginPath(); ctx.moveTo((x - 0.5) * u, (y + 0.3) * u); ctx.lineTo((x + 0.5) * u, (y - 0.3) * u); ctx.stroke(); }
        if (v.env.bubble[i]) { ctx.beginPath(); ctx.arc(x * u, y * u, u * 0.8, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(80,70,50,0.6)'; ctx.lineWidth = u * 0.06; ctx.stroke(); }
        if (v.toxin[i]) { ctx.fillStyle = `rgba(110,50,130,${0.12 * v.toxin[i]})`; ctx.beginPath(); ctx.arc(x * u, y * u, u, 0, 7); ctx.fill(); }
      }
      for (const pass of [0, 1]) {
        for (let i = 0; i < P.N; i++) {
          const slot = v.slot[i];
          if (slot < 0 || v.amt[i] < 0.03) continue;
          const [x, y] = P.pos(P.CELLS[i]);
          const rgb = v.slotRGB[slot];
          const k = pass ? 0.38 : 0.62;
          const c = pass ? rgb : rgb.map(c2 => c2 * k);
          ctx.fillStyle = css(c, pass ? 0.92 : 0.95);
          ctx.beginPath();
          ctx.arc(x * u, y * u, u * (pass ? 0.92 : 1.02) * Math.min(1, v.amt[i] * 1.1), 0, 7);
          ctx.fill();
        }
      }
      ctx.restore();
      if (v.desat > 0) { ctx.fillStyle = `rgba(200,205,210,${v.desat * 0.45})`; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); }
      if (v.glow > 0) { ctx.fillStyle = `rgba(255,220,150,${v.glow * 0.18})`; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, R + u * 0.3, 0, 7); ctx.strokeStyle = 'rgba(230,240,245,0.35)'; ctx.lineWidth = u * 0.5; ctx.stroke();
    },
  };
}

export class DishView {
  constructor(glCanvas, fxCanvas, { forceCanvas = false } = {}) {
    this.gl = glCanvas;
    this.fx = fxCanvas;
    this.fxc = fxCanvas.getContext('2d');
    this.backend = (!forceCanvas && glBackend(glCanvas)) || null;
    if (!this.backend) {
      // a canvas that had a webgl context request cannot give a 2d one; swap it
      const c2 = document.createElement('canvas');
      c2.className = glCanvas.className;
      c2.id = glCanvas.id;
      glCanvas.replaceWith(c2);
      this.gl = c2;
      this.backend = canvasBackend(c2);
    }
    this.size = 300;
    this.dpr = 1;
    this.unit = 10;
    this.slot = new Int8Array(P.N).fill(-1);
    this.amt = new Float32Array(P.N);
    this.target = new Float32Array(P.N);
    this.startAt = new Float64Array(P.N);
    this.flash = new Float32Array(P.N);
    this.toxin = new Uint8Array(P.N);
    this.cellData = new Uint8Array(T * T * 4);
    this.envData = new Uint8Array(T * T * 4);
    this.slotData = new Uint8Array(16 * 4 * 4);
    this.slotRGB = [];
    this.env = null;
    this.envDirty = true;
    this.slotDirty = true;
    this.texel = P.CELLS.map(c => ((c.r + P.R) * T + (c.q + P.R)) * 4);
    this.motion = 1;
    this.desat = 0;
    this.glow = 0;
    this.envIn = 1;
    this.ripples = [];
    this.ghost = null;
    this.entries = [];
    this.entryPreview = null;
    this.last = 0;
    this.quality = 1; // render scale, lowered automatically on slow GPUs
    this.slowFrames = 0;
    this.cssSize = 300;
  }

  get kind() { return this.backend.kind; }

  resize(cssSize) {
    this.cssSize = cssSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.quality;
    const px = Math.round(Math.min(cssSize * dpr, 1000));
    for (const c of [this.gl, this.fx]) {
      c.style.width = c.style.height = `${cssSize}px`;
      c.width = c.height = px;
    }
    this.size = cssSize;
    this.dpr = px / cssSize;
    this.unit = cssSize / 2 / (DISH_R + 1.7); // room outside the rim for entry marks
  }

  slotOf(st) { return st.owner === 'x' ? INV_SLOT : st.pal % 8; }

  setStrains(strains) {
    this.slotData.fill(0);
    this.slotRGB = [];
    for (const st of strains) {
      const s = this.slotOf(st);
      const rgb = strainRGB(st);
      this.slotRGB[s] = rgb;
      const o = s * 4;
      const row = k => k * 16 * 4 + o;
      const has = t => (st.traits.includes(t) ? 255 : 0);
      this.slotData.set([...rgb, st.owner === 'x' ? 255 : 0], row(0));
      this.slotData.set([has('prey'), has('shell'), has('toxic'), has('photo')], row(1));
      this.slotData.set([has('dormant'), has('spore'), has('grow'), has('symbio')], row(2));
      this.slotData.set([st.owner === 'p' ? 255 : 0, 0, 0, 255], row(3));
    }
    this.slotDirty = true;
  }

  setEnv(env) {
    this.env = env;
    this.envData.fill(0);
    for (let i = 0; i < P.N; i++) {
      const o = this.texel[i];
      this.envData[o] = env.light[i] * 127;
      this.envData[o + 1] = env.nutrient[i] * 255;
      this.envData[o + 2] = env.anti[i] * 255;
      this.envData[o + 3] = env.bubble[i] * 255;
    }
    this.envDirty = true;
  }

  clear() {
    this.slot.fill(-1); this.amt.fill(0); this.target.fill(0); this.flash.fill(0); this.toxin.fill(0);
    this.ripples = [];
  }

  // New target state from the simulation. `bloom` = cell index the change radiates from.
  setCells(cells, toxin, strains, now, bloom = -1) {
    for (let i = 0; i < P.N; i++) {
      const id = cells[i];
      if (id < 0) { this.target[i] = 0; continue; }
      const s = this.slotOf(strains.get(id));
      if (s !== this.slot[i]) {
        if (this.slot[i] >= 0 && this.amt[i] > 0.25) { this.amt[i] = 0.45; this.flash[i] = 1; }
        else this.amt[i] = 0;
        this.slot[i] = s;
        this.startAt[i] = bloom >= 0 ? now + P.hexDist(P.CELLS[i], P.CELLS[bloom]) * 70 : now;
      }
      this.target[i] = 1;
    }
    this.toxin.set(toxin);
  }

  ripple(i, rgb, strength = 1) {
    const [x, y] = P.pos(P.CELLS[i]);
    this.ripples.push({ x, y, rgb, t0: performance.now(), strength });
  }

  // footprint of a drop on cell i: the cell and its open neighbours
  footprint(day, i) {
    if (i < 0 || day.env.bubble[i]) return [];
    return [i, ...P.NEIGH[i].filter(n => day.cells[n] < 0 && !day.env.bubble[n] && !day.toxin[n])];
  }

  cellAt(clientX, clientY) {
    const r = this.fx.getBoundingClientRect();
    const x = (clientX - r.left - r.width / 2) / this.unit, y = (clientY - r.top - r.height / 2) / this.unit;
    let best = -1, bd = Infinity;
    for (let i = 0; i < P.N; i++) {
      const [cx, cy] = P.pos(P.CELLS[i]);
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 1.2 ? best : -1;
  }

  // true while colonies are still visibly changing
  get settling() {
    for (let i = 0; i < P.N; i++) if (Math.abs(this.target[i] - this.amt[i]) > 0.05) return true;
    return false;
  }

  // Dynamic resolution: if frames keep running long, render the dish at a lower scale.
  watchSpeed(rawDt) {
    if (this.kind !== 'gl' || this.quality <= 0.55) return;
    this.slowFrames = rawDt > 26 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 45) {
      this.quality = Math.max(0.55, this.quality - 0.15);
      this.slowFrames = 0;
      this.resize(this.cssSize);
    }
  }

  render(now) {
    if (this.last) this.watchSpeed(now - this.last);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    for (let i = 0; i < P.N; i++) {
      if (now < this.startAt[i]) continue;
      const tg = this.target[i];
      const rate = tg > this.amt[i] ? 6.5 : 3.2;
      this.amt[i] += (tg - this.amt[i]) * Math.min(1, dt * rate);
      if (tg === 0 && this.amt[i] < 0.02) { this.amt[i] = 0; this.slot[i] = -1; }
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2.5);
      const o = this.texel[i];
      this.cellData[o] = this.slot[i] + 1;
      this.cellData[o + 1] = Math.round(Math.min(1, this.amt[i]) * 255);
      this.cellData[o + 2] = this.toxin[i] * 85;
      this.cellData[o + 3] = Math.round(this.flash[i] * 255);
    }
    if (!this.env) return;
    this.time = now / 1000;
    this.backend.draw(this);
    this.drawFx(now);
  }

  drawFx(now) {
    const c = this.fxc, s = this.fx.width, u = this.unit * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, s, s);
    c.translate(s / 2, s / 2);
    const R = DISH_R * u;
    // invader entry points: an ink stain seeping over the rim
    for (const e of this.entries) {
      const [x, y] = P.pos(P.CELLS[e]);
      const a = Math.atan2(y, x);
      const pulse = 0.5 + 0.5 * Math.sin(now / 400);
      const gx = Math.cos(a) * (R - u * 0.4), gy = Math.sin(a) * (R - u * 0.4);
      const g = c.createRadialGradient(gx, gy, 0, gx, gy, u * 1.9);
      g.addColorStop(0, css(INVADER.glow, 0.32 + 0.18 * pulse));
      g.addColorStop(1, css(INVADER.glow, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(gx, gy, u * 1.9, 0, 7); c.fill();
      c.beginPath();
      c.arc(0, 0, R + u * 0.35, a - 0.16, a + 0.16);
      c.strokeStyle = css(INVADER.glow, 0.7 + 0.3 * pulse);
      c.lineWidth = u * 0.28;
      c.lineCap = 'round';
      c.stroke();
      if (this.entryPreview) {
        const ox = Math.cos(a) * (R + u * 1.05), oy = Math.sin(a) * (R + u * 1.05);
        c.beginPath(); c.arc(ox, oy, u * 0.5, 0, 7);
        c.fillStyle = css(INVADER.rgb, 0.95); c.fill();
        c.strokeStyle = css(INVADER.glow, 0.9); c.lineWidth = u * 0.12; c.stroke();
      }
    }
    // aiming ghost
    if (this.ghost && this.ghost.cells.length) {
      const { cells, rgb } = this.ghost;
      for (const i of cells) {
        const [x, y] = P.pos(P.CELLS[i]);
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = (x + Math.cos(a) * 0.98) * u, py = (y + Math.sin(a) * 0.98) * u;
          k ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        c.fillStyle = css(rgb, 0.42);
        c.fill();
      }
      const [x0, y0] = P.pos(P.CELLS[cells[0]]);
      c.beginPath();
      c.arc(x0 * u, y0 * u, u * 2.6, 0, 7);
      c.setLineDash([u * 0.3, u * 0.3]);
      c.strokeStyle = 'rgba(255,250,235,0.85)';
      c.lineWidth = Math.max(1.5, u * 0.08);
      c.stroke();
      c.setLineDash([]);
    }
    // ripples from drops and arrivals
    this.ripples = this.ripples.filter(r => now - r.t0 < 1100);
    for (const r of this.ripples) {
      const k = (now - r.t0) / 1100;
      for (const off of [0, 0.18]) {
        const kk = k - off;
        if (kk <= 0) continue;
        c.beginPath();
        c.arc(r.x * u, r.y * u, u * (0.6 + kk * 4.2 * r.strength), 0, 7);
        c.strokeStyle = css(r.rgb, (1 - kk) * 0.55);
        c.lineWidth = Math.max(1, u * 0.12 * (1 - kk));
        c.stroke();
      }
    }
  }

  // A small framed image of the current dish (for the specimen shelf).
  snapshot(size = 220) {
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const c = out.getContext('2d');
    c.fillStyle = '#141a1d';
    c.fillRect(0, 0, size, size);
    c.drawImage(this.gl, 0, 0, size, size);
    return out.toDataURL('image/jpeg', 0.82);
  }
}

export { PALETTE };
