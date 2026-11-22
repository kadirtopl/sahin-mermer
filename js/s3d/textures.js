import * as THREE from 'three';

/*
 * Procedural canvas textures for the light, upscale kitchen scene.
 * Everything is deterministic (seeded mulberry32), tileable (RepeatWrapping)
 * and cheap: per-pixel JS loops stay at or below 512x512, larger maps are
 * built with canvas draw calls (scaled small canvases = smooth value noise).
 * No ctx.filter, no OffscreenCanvas, no top-level await.
 */

/* ------------------------------------------------------------------ utils */

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// integer hash -> [0,1)
function hash01(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function toSize(v, def, min, max) {
  const n = Math.round(Number(v));
  return clamp(Number.isFinite(n) && n > 0 ? n : def, min, max);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// Free a temporary canvas backing store right away (helps iOS memory caps).
function release(c) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

function finishTexture(canvas, srgb, name) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

// random table in [-1,1]
function randArr(rand, n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rand() * 2 - 1;
  return a;
}

// periodic 1D value noise, t in table cells
function noise1(arr, t) {
  const n = arr.length;
  let i = Math.floor(t);
  let f = t - i;
  i %= n;
  if (i < 0) i += n;
  const j = i + 1 === n ? 0 : i + 1;
  f = f * f * (3 - 2 * f);
  return arr[i] + (arr[j] - arr[i]) * f;
}

// periodic 2D value-noise lattice (cx x cy cells over one tile)
function lattice(rand, cx, cy) {
  const a = new Float32Array(cx * cy);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return { a, cx, cy };
}

// u,v in tile units (wraps), smoothstep interpolation, returns [0,1]
function sampleL(L, u, v) {
  const cx = L.cx;
  const cy = L.cy;
  const x = u * cx;
  const y = v * cy;
  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  xi %= cx;
  if (xi < 0) xi += cx;
  yi %= cy;
  if (yi < 0) yi += cy;
  const x1 = xi + 1 === cx ? 0 : xi + 1;
  const y1 = yi + 1 === cy ? 0 : yi + 1;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = L.a;
  const r0 = yi * cx;
  const r1 = y1 * cx;
  const top = a[r0 + xi] + (a[r0 + x1] - a[r0 + xi]) * fx;
  const bot = a[r1 + xi] + (a[r1 + x1] - a[r1 + xi]) * fx;
  return top + (bot - top) * fy;
}

// Ring-profile lookup tables (gaussian bumps over the ring fraction).
const LUT_N = 512;
let LUTS = null;
function luts() {
  if (LUTS) return LUTS;
  const mk = (c, w) => {
    const a = new Float32Array(LUT_N + 1);
    for (let i = 0; i <= LUT_N; i++) {
      const d = (i / LUT_N - c) / w;
      a[i] = Math.exp(-d * d);
    }
    return a;
  };
  LUTS = {
    oakA: mk(0.5, 0.13),
    oakB: mk(0.2, 0.05),
    walA: mk(0.5, 0.21),
    walB: mk(0.12, 0.05),
  };
  return LUTS;
}

/*
 * Tileable anisotropic speckle (wood pores), multiplied onto ctx.
 * A tiny cols x rows canvas (wrap-padded by 2 cells) is upscaled with
 * bilinear smoothing, so each dark cell becomes a soft short dash.
 */
function drawPores(ctx, W, H, rand, cols, rows, density, vMin, vMax, alpha) {
  const pad = 2;
  const cw = cols + pad * 2;
  const chh = rows + pad * 2;
  const core = new Float32Array(cols * rows);
  for (let i = 0; i < core.length; i++) {
    core[i] = rand() < density ? vMin + (vMax - vMin) * rand() : 255;
  }
  const c = makeCanvas(cw, chh);
  const g = c.getContext('2d');
  const img = g.createImageData(cw, chh);
  const d = img.data;
  for (let y = 0; y < chh; y++) {
    const sy = (((y - pad) % rows) + rows) % rows;
    for (let x = 0; x < cw; x++) {
      const sx = (((x - pad) % cols) + cols) % cols;
      const k = 255 - core[sy * cols + sx];
      const o = (y * cw + x) * 4;
      // warm brown tint: blue darkens most
      d[o] = 255 - k * 0.9;
      d[o + 1] = 255 - k * 1.05;
      d[o + 2] = 255 - k * 1.28;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const cellW = W / cols;
  const cellH = H / rows;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, -pad * cellW, -pad * cellH, cw * cellW, chh * cellH);
  ctx.restore();
  release(c);
}

/* ---------------------------------------------------------- oak floor */

// Renders one board (pw x len px in final space): color into cv, roughness
// (grayscale, linear) into cvR. Both small; caller scales them into place.
function renderOakBoard(rand, cv, cvR, pw, len, k, colPx, rowPx) {
  const { oakA, oakB } = luts();
  const gw = Math.max(12, Math.round(pw / colPx));
  const gh = Math.max(8, Math.round(len / rowPx));
  cv.width = gw;
  cv.height = gh;
  cvR.width = gw;
  cvR.height = gh;
  const g = cv.getContext('2d');
  const gR = cvR.getContext('2d');
  const img = g.createImageData(gw, gh);
  const imgR = gR.createImageData(gw, gh);
  const d = img.data;
  const dR = imgR.data;

  const bseed = (rand() * 0x7fffffff) | 0;
  const cathedral = rand() < 0.5;
  const sp = Math.max(2.4, (5.5 + rand() * 4) * k); // ring spacing (px)
  const invSp = 1 / sp;
  let px0;
  let depth;
  let tilt;
  if (cathedral) {
    // pith above the board: nested arches
    px0 = pw * (0.25 + rand() * 0.5);
    depth = pw * (0.12 + rand() * 0.3);
    tilt = (0.025 + rand() * 0.045) * (rand() < 0.5 ? -1 : 1);
  } else {
    // rift / straight grain: pith far to one side
    px0 = pw * (0.5 + (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 1.6));
    depth = pw * (0.4 + rand() * 1.2);
    tilt = (rand() - 0.5) * 0.012;
  }
  const d2 = depth * depth;
  const tone = (rand() - 0.5) * 0.11 + (rand() < 0.18 ? (rand() < 0.5 ? -0.05 : 0.04) : 0);
  const warm = (rand() - 0.5) * 0.05;
  const gAmp = cathedral ? 0.2 + rand() * 0.06 : 0.14 + rand() * 0.06;
  const wobA = (2 + rand() * 7) * k;
  const wf = 0.5 + rand() * 0.3;
  const ph = rand() * 6.2832;
  const yOff = rand() * 4000 * k;
  const nA = randArr(rand, 16);
  const nB = randArr(rand, 16);
  const nC = randArr(rand, 12);
  const nD = randArr(rand, 24);

  const baseR = 219 * (1 + tone) * (1 + warm);
  const baseG = 195 * (1 + tone);
  const baseB = 159 * (1 + tone) * (1 - warm * 1.4);

  const roughBase = 0.58 - tone * 0.3;

  const sx = pw / gw;
  const sy = len / gh;
  const colVar = new Float32Array(gw);
  for (let x = 0; x < gw; x++) colVar[x] = 0.02 * noise1(nD, ((x + 0.5) * sx) / (45 * k));

  for (let y = 0; y < gh; y++) {
    const py = (y + 0.5) * sy;
    const yy = py + yOff;
    const xp = px0 + wobA * noise1(nA, yy / (260 * k));
    const rowRing = tilt * py * invSp + 0.6 * noise1(nB, yy / (180 * k));
    const lenMod = 1 + 0.03 * noise1(nC, yy / (340 * k));
    let o = y * gw * 4;
    for (let x = 0; x < gw; x++, o += 4) {
      const dx = (x + 0.5) * sx - xp;
      let ring = (Math.sqrt(dx * dx + d2) - depth) * invSp;
      ring += 0.28 * Math.sin(ring * wf + ph) + rowRing;
      const ki = Math.floor(ring);
      const fi = ((ring - ki) * LUT_N) | 0;
      const s1 = 0.3 + 0.7 * hash01(ki * 2 + bseed);
      const s2 = hash01(ki * 2 + 1 + bseed);
      const gg = gAmp * (s1 * oakA[fi] + 0.45 * s2 * oakB[fi]);
      const lm = lenMod + colVar[x];
      d[o] = baseR * lm * (1 - 0.78 * gg);
      d[o + 1] = baseG * lm * (1 - gg);
      d[o + 2] = baseB * lm * (1 - 1.3 * gg);
      d[o + 3] = 255;
      // roughness: grain lines / darker boards a bit rougher (~0.55-0.71)
      const rv = (roughBase + gg * 0.42 + 0.012 * (hash01(x * 73856093 ^ y * 19349663 ^ bseed) - 0.5)) * 255;
      dR[o] = rv;
      dR[o + 1] = rv;
      dR[o + 2] = rv;
      dR[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  gR.putImageData(imgR, 0, 0);
}

function drawKnot(ctx, rand, kx, ky, r, k, clipX, clipW, S) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, 0, clipW, S);
  ctx.clip();
  // grain deflecting around the knot (lens shaped, faint)
  ctx.lineWidth = Math.max(1, 1.8 * k);
  for (let j = 1; j <= 3; j++) {
    const w = r * (0.7 + j * 0.6);
    const h = r * (2 + j * 2.2);
    const a = 0.1 - j * 0.02;
    ctx.strokeStyle = 'rgba(122,92,60,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(kx, ky - h);
    ctx.quadraticCurveTo(kx + w * 2, ky, kx, ky + h);
    ctx.quadraticCurveTo(kx - w * 2, ky, kx, ky - h);
    ctx.stroke();
  }
  // knot body
  ctx.translate(kx, ky);
  ctx.rotate((rand() - 0.5) * 0.5);
  ctx.scale(1, 0.65 + rand() * 0.3);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  grd.addColorStop(0, 'rgba(66,43,26,0.92)');
  grd.addColorStop(0.45, 'rgba(86,60,37,0.85)');
  grd.addColorStop(0.8, 'rgba(122,90,58,0.42)');
  grd.addColorStop(1, 'rgba(150,118,82,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // tiny check crack
  ctx.strokeStyle = 'rgba(48,30,18,0.55)';
  ctx.lineWidth = Math.max(0.6, 0.7 * k);
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.1);
  ctx.lineTo(r * 0.3, r * 0.12);
  ctx.stroke();
  ctx.restore();
}

function circDist(a, b, S) {
  let d = Math.abs(a - b) % S;
  return Math.min(d, S - d);
}

/**
 * Light natural European oak, wide planks running along the texture's V axis.
 * @returns {{ map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture }}
 */
export function oakFloorTexture({ size = 1024, planks = 7, seed = 7 } = {}) {
  const S = toSize(size, 1024, 64, 2048);
  const P = toSize(planks, 7, 1, 32);
  const rand = mulberry32(seed);
  const k = S / 1024;
  const pw = S / P;
  const colPx = 1;
  const rowPx = Math.max(3, 7 * k);

  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = 'rgb(210,186,150)';
  ctx.fillRect(0, 0, S, S);

  // 1) staggered end joints per plank column (circular in V)
  const minGap = S * 0.16;
  const joints = [];
  for (let i = 0; i < P; i++) {
    const n = rand() < 0.3 ? 2 : 1;
    let best = null;
    let bestScore = -1;
    for (let t = 0; t < 24; t++) {
      const j0 = rand() * S;
      const js = n === 1 ? [j0] : [j0, (j0 + S * (0.38 + rand() * 0.24)) % S];
      let score = Infinity;
      for (const a of js) {
        if (i > 0) for (const b of joints[i - 1]) score = Math.min(score, circDist(a, b, S));
        if (i > 1) for (const b of joints[i - 2]) score = Math.min(score, circDist(a, b, S) * 1.5);
        if (i === P - 1 && P > 2) for (const b of joints[0]) score = Math.min(score, circDist(a, b, S));
      }
      if (score > bestScore) {
        bestScore = score;
        best = js;
      }
      if (score >= minGap) break;
    }
    best.sort((a, b) => a - b);
    joints.push(best);
  }

  // roughness canvas (linear), built with draw calls only: no getImageData
  // readback from the (possibly GPU) color canvas.
  const RS = Math.min(S, 512);
  const q = RS / S;
  const rc = makeCanvas(RS, RS);
  const rctx = rc.getContext('2d');
  rctx.imageSmoothingEnabled = true;
  rctx.fillStyle = 'rgb(150,150,150)';
  rctx.fillRect(0, 0, RS, RS);

  // 2) boards
  const scratch = makeCanvas(1, 1);
  const scratchR = makeCanvas(1, 1);
  for (let i = 0; i < P; i++) {
    const x0 = i * pw;
    const js = joints[i];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, pw, S);
    ctx.clip();
    rctx.save();
    rctx.beginPath();
    rctx.rect(x0 * q, 0, pw * q, RS);
    rctx.clip();
    for (let b = 0; b < js.length; b++) {
      const start = js[b];
      const end = b + 1 < js.length ? js[b + 1] : js[0] + S;
      const len = end - start;
      renderOakBoard(rand, scratch, scratchR, pw, len, k, colPx, rowPx);
      ctx.drawImage(scratch, x0, start, pw, len);
      rctx.drawImage(scratchR, x0 * q, start * q, pw * q, len * q);
      if (end > S) {
        ctx.drawImage(scratch, x0, start - S, pw, len);
        rctx.drawImage(scratchR, x0 * q, (start - S) * q, pw * q, len * q);
      }
    }
    ctx.restore();
    rctx.restore();
  }
  release(scratch);
  release(scratchR);

  // 3) pores (two incommensurate layers so no grid shows)
  drawPores(ctx, S, S, rand, Math.max(8, Math.round(S * 0.8)), 70, 0.11, 170, 228, 0.34);
  drawPores(ctx, S, S, rand, Math.max(8, Math.round(S * 0.45)), 43, 0.08, 178, 232, 0.22);

  // 4) a few knots, away from joints. The grain lens around a knot reaches
  // ~8.6r along V, so keep that whole reach inside one board and inside the
  // tile (the column clip does not wrap) -> no cut lines at joints/tile edge.
  const nKnots = 2 + Math.floor(rand() * 3);
  for (let n = 0; n < nKnots; n++) {
    const ci = Math.floor(rand() * P);
    const r = Math.max(2.5, (5 + rand() * 7) * k);
    const reach = r * 8.6 + 2;
    if (S - 2 * reach < 8) continue;
    let ky = 0;
    let ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      ky = reach + rand() * (S - 2 * reach);
      ok = joints[ci].every((j) => circDist(j, ky, S) > reach);
    }
    if (!ok) continue;
    const kx = ci * pw + pw * (0.2 + rand() * 0.6);
    drawKnot(ctx, rand, kx, ky, r, k, ci * pw, pw, S);
    rctx.fillStyle = 'rgba(190,190,190,0.45)';
    rctx.beginPath();
    rctx.arc(kx * q, ky * q, r * q * 0.8, 0, Math.PI * 2);
    rctx.fill();
  }

  // 5) seams: very thin dark line, soft shade, faint bevel highlight
  const sw = Math.max(1, 1.15 * k);
  const hw = Math.max(0.75, 0.8 * k);
  const sh = 3 * k + 1;
  const seamCol = 'rgba(86,62,40,0.8)';
  const hiCol = 'rgba(255,247,230,0.16)';
  const hSeam = (x, w, y) => {
    for (const yy of [y, y - S, y + S]) {
      if (yy < -sh - 2 || yy > S + sh + 2) continue;
      const gr = ctx.createLinearGradient(0, yy - sh, 0, yy + sh);
      gr.addColorStop(0, 'rgba(90,66,44,0)');
      gr.addColorStop(0.5, 'rgba(90,66,44,0.12)');
      gr.addColorStop(1, 'rgba(90,66,44,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x, yy - sh, w, sh * 2);
      ctx.fillStyle = seamCol;
      ctx.fillRect(x, yy - sw / 2, w, sw);
      ctx.fillStyle = hiCol;
      ctx.fillRect(x, yy + sw / 2, w, hw);
    }
  };
  const vSeam = (x) => {
    const gr = ctx.createLinearGradient(x - sh, 0, x + sh, 0);
    gr.addColorStop(0, 'rgba(90,66,44,0)');
    gr.addColorStop(0.5, 'rgba(90,66,44,0.12)');
    gr.addColorStop(1, 'rgba(90,66,44,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - sh, 0, sh * 2, S);
    ctx.fillStyle = seamCol;
    ctx.fillRect(x - sw / 2, 0, sw, S);
    ctx.fillStyle = hiCol;
    ctx.fillRect(x + sw / 2, 0, hw, S);
  };
  for (let i = 0; i < P; i++) for (const j of joints[i]) hSeam(i * pw, pw, j);
  for (let i = 0; i < P; i++) vSeam(i * pw);
  vSeam(S);

  // 6) roughness seams: rougher (~0.83)
  const rw = Math.max(1, sw * q * 1.3);
  rctx.fillStyle = 'rgb(212,212,212)'; // ~0.83
  for (let i = 0; i <= P; i++) rctx.fillRect(i * pw * q - rw / 2, 0, rw, RS);
  for (let i = 0; i < P; i++) {
    for (const j of joints[i]) {
      for (const yy of [j, j - S, j + S]) {
        if (yy < -4 || yy > S + 4) continue;
        rctx.fillRect(i * pw * q, yy * q - rw / 2, pw * q, rw);
      }
    }
  }

  return {
    map: finishTexture(canvas, true, 'oakFloor.map'),
    roughnessMap: finishTexture(rc, false, 'oakFloor.roughness'),
  };
}

/* -------------------------------------------------------- walnut veneer */

/**
 * Fine vertical-grain veneer for flat slab doors. tone: 'dark' walnut | 'light' oak.
 * @returns {{ map: THREE.CanvasTexture }}
 */
export function walnutTexture({ size = 512, seed = 3, tone = 'dark' } = {}) {
  const S = toSize(size, 512, 32, 2048);
  const rand = mulberry32(seed);
  const light = tone === 'light';
  const { walA, walB } = luts();

  // per-pixel at most 512 wide x 256 tall (grain is vertical, V upscaled x2)
  const W = Math.min(S, 512);
  const H = W >= 256 ? W >> 1 : W;
  const base = light ? [210, 186, 150] : [72, 51, 38];
  const line = light ? [166, 135, 99] : [37, 26, 19];
  const M = light ? 34 : 46; // lines across one tile
  const C = light ? 11 : 16; // cathedral strength (C*PI > M -> a few arches)
  const N = 3; // ring advance along V per tile (integer keeps it tileable)
  const e = 0.07;
  const uc = rand();

  // column term: linear rings + cathedral hump. Ring-width irregularity is a
  // small periodic displacement of u (not of the ring value), so flat
  // cathedral zones stay clean instead of zig-zagging.
  const jit = randArr(rand, 128);
  const jit2 = randArr(rand, 32);
  const colRing = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u0 = (x + 0.5) / W;
    const u = u0 + 0.0025 * noise1(jit, u0 * 128) + 0.008 * noise1(jit2, u0 * 32);
    const c = Math.cos(Math.PI * (u - uc));
    colRing[x] = M * u - C * Math.sqrt(c * c + e * e);
  }

  // low-res periodic fields: warp, line strength, tone, hue
  const fw = Math.max(16, W >> 2);
  const fh = Math.max(8, H >> 2);
  const Lw1 = lattice(rand, 3, 2);
  const Lw2 = lattice(rand, 8, 2);
  const Ls1 = lattice(rand, 23, 3);
  const Ls2 = lattice(rand, 53, 2);
  const Lt1 = lattice(rand, 4, 3);
  const Lt2 = lattice(rand, 9, 6);
  const Lh = lattice(rand, 5, 4);
  const FW = new Float32Array(fw * fh);
  const FS = new Float32Array(fw * fh);
  const FT = new Float32Array(fw * fh);
  const FH = new Float32Array(fw * fh);
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      const u = i / fw;
      const v = j / fh;
      const o = j * fw + i;
      FW[o] = 2.2 * (sampleL(Lw1, u, v) - 0.5) + 0.7 * (sampleL(Lw2, u, v) - 0.5);
      FS[o] = 0.22 + 0.78 * (0.62 * sampleL(Ls1, u, v) + 0.38 * sampleL(Ls2, u, v));
      FT[o] = 1 + 0.11 * (sampleL(Lt1, u, v) - 0.5) + 0.05 * (sampleL(Lt2, u, v) - 0.5);
      FH[o] = 0.06 * (sampleL(Lh, u, v) - 0.5);
    }
  }
  const cx0 = new Int32Array(W);
  const cx1 = new Int32Array(W);
  const ctx_ = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const f = ((x + 0.5) / W) * fw;
    const i0 = Math.floor(f) % fw;
    cx0[x] = i0;
    cx1[x] = (i0 + 1) % fw;
    ctx_[x] = f - Math.floor(f);
  }

  const half = makeCanvas(W, H);
  const hctx = half.getContext('2d');
  const img = hctx.createImageData(W, H);
  const d = img.data;
  const b0 = base[0], b1 = base[1], b2 = base[2];
  const l0 = line[0] - b0, l1 = line[1] - b1, l2 = line[2] - b2;
  for (let y = 0; y < H; y++) {
    const fyy = ((y + 0.5) / H) * fh;
    const j0 = Math.floor(fyy) % fh;
    const ty = fyy - Math.floor(fyy);
    const j1 = (j0 + 1) % fh;
    const r0 = j0 * fw;
    const r1 = j1 * fw;
    const rowRing = (N * (y + 0.5)) / H;
    let o = y * W * 4;
    for (let x = 0; x < W; x++, o += 4) {
      const tx = ctx_[x];
      const a00 = r0 + cx0[x], a01 = r0 + cx1[x], a10 = r1 + cx0[x], a11 = r1 + cx1[x];
      const w01 = tx * (1 - ty), w10 = (1 - tx) * ty, w11 = tx * ty, w00 = 1 - w01 - w10 - w11;
      const warp = FW[a00] * w00 + FW[a01] * w01 + FW[a10] * w10 + FW[a11] * w11;
      const str = FS[a00] * w00 + FS[a01] * w01 + FS[a10] * w10 + FS[a11] * w11;
      const tn = FT[a00] * w00 + FT[a01] * w01 + FT[a10] * w10 + FT[a11] * w11;
      const hu = FH[a00] * w00 + FH[a01] * w01 + FH[a10] * w10 + FH[a11] * w11;
      const ring = colRing[x] + rowRing + warp;
      const fi = ((ring - Math.floor(ring)) * LUT_N) | 0;
      let t = str * (walA[fi] + 0.32 * walB[fi]) * 0.9;
      if (t > 1) t = 1;
      d[o] = (b0 + l0 * t) * tn * (1 + hu);
      d[o + 1] = (b1 + l1 * t) * tn;
      d[o + 2] = (b2 + l2 * t) * tn * (1 - hu);
      d[o + 3] = 255;
    }
  }
  hctx.putImageData(img, 0, 0);

  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(half, 0, 0, S, S);
  release(half);

  drawPores(
    ctx, S, S, rand, Math.max(8, S >> 1), 28, 0.17,
    light ? 178 : 140, light ? 232 : 212, light ? 0.42 : 0.5
  );

  return { map: finishTexture(canvas, true, light ? 'veneer.lightOak' : 'veneer.walnut') };
}

/* ------------------------------------------------------ plaster / limewash */

/**
 * Very subtle warm limewash wall around `color`.
 * @returns {{ map: THREE.CanvasTexture }}
 */
export function plasterTexture({ size = 512, seed = 5, color = '#efe7dc' } = {}) {
  const S = toSize(size, 512, 32, 1024);
  const rand = mulberry32(seed);
  const col = new THREE.Color(0xefe7dc);
  try {
    col.set(color);
  } catch (err) {
    col.set(0xefe7dc);
  }
  const hex = col.getHex(); // sRGB
  const R = (hex >> 16) & 255;
  const G = (hex >> 8) & 255;
  const B = hex & 255;

  // Per-pixel work is capped at 512x512; larger sizes are a wrap-padded
  // bilinear upscale (seamless), so size 1024 stays cheap on phones.
  const P = Math.min(S, 512);

  // low-res fbm with a soft domain warp (cloudy, brushed-on look)
  const LR = clamp(P >> 2, 32, 256);
  const oct = [
    [lattice(rand, 3, 3), 0.42],
    [lattice(rand, 6, 6), 0.26],
    [lattice(rand, 12, 12), 0.16],
    [lattice(rand, 24, 24), 0.1],
    [lattice(rand, 48, 48), 0.06],
  ];
  const Wx = lattice(rand, 3, 3);
  const Wy = lattice(rand, 3, 3);
  const F = new Float32Array(LR * LR);
  for (let j = 0; j < LR; j++) {
    for (let i = 0; i < LR; i++) {
      const u = i / LR;
      const v = j / LR;
      const uu = u + 0.1 * (sampleL(Wx, u, v) - 0.5);
      const vv = v + 0.1 * (sampleL(Wy, u, v) - 0.5);
      let n = 0;
      for (let m = 0; m < oct.length; m++) n += oct[m][1] * sampleL(oct[m][0], uu, vv);
      F[j * LR + i] = n;
    }
  }

  // fine sand grain, one value per tile pixel (pad pixels reuse wrapped ones)
  const grain = new Float32Array(P * P);
  for (let i = 0; i < grain.length; i++) grain[i] = rand() - 0.5;

  const pad = S > P ? 1 : 0;
  const PP = P + pad * 2;
  const work = makeCanvas(PP, PP);
  const wctx = work.getContext('2d');
  const img = wctx.createImageData(PP, PP);
  const d = img.data;
  const sc = LR / P;
  for (let yy = 0; yy < PP; yy++) {
    let y = yy - pad;
    if (y < 0) y += P;
    else if (y >= P) y -= P;
    const fy = y * sc;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const y1 = y0 + 1 === LR ? 0 : y0 + 1;
    const r0 = y0 * LR;
    const r1 = y1 * LR;
    const gRow = y * P;
    let o = yy * PP * 4;
    for (let xx = 0; xx < PP; xx++, o += 4) {
      let x = xx - pad;
      if (x < 0) x += P;
      else if (x >= P) x -= P;
      const fx = x * sc;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const x1 = x0 + 1 === LR ? 0 : x0 + 1;
      const a = F[r0 + x0] + (F[r0 + x1] - F[r0 + x0]) * tx;
      const b = F[r1 + x0] + (F[r1 + x1] - F[r1 + x0]) * tx;
      const n = a + (b - a) * ty;
      // darker patches slightly warmer (pigment pooling), plus fine sand grain
      const s = (n - 0.5) * 0.1 + grain[gRow + x] * 0.014;
      d[o] = R * (1 + s * 0.9);
      d[o + 1] = G * (1 + s);
      d[o + 2] = B * (1 + s * 1.25);
      d[o + 3] = 255;
    }
  }
  wctx.putImageData(img, 0, 0);
  if (!pad) return { map: finishTexture(work, true, 'plaster.map') };

  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  const c = S / P;
  ctx.drawImage(work, -c, -c, PP * c, PP * c);
  release(work);
  return { map: finishTexture(canvas, true, 'plaster.map') };
}

/* ------------------------------------------------------ brushed brass */

/**
 * Horizontal brushed-metal roughness streaks, values ~0.25-0.45 (linear).
 * @returns {{ roughnessMap: THREE.CanvasTexture }}
 */
export function brushedBrassTexture({ size = 256 } = {}) {
  const S = toSize(size, 256, 16, 1024);
  const rand = mulberry32(0x5eed + S);
  const smooth = randArr(rand, 32);
  const L = lattice(rand, 5, S); // 5 cells along U, one row per pixel row
  const fine = new Float32Array(S);
  const scStart = new Float32Array(S);
  const scLen = new Float32Array(S);
  const scAmp = new Float32Array(S);
  for (let y = 0; y < S; y++) {
    fine[y] = rand();
    if (rand() < 0.045) {
      scStart[y] = rand() * S;
      scLen[y] = S * (0.2 + rand() * 0.7);
      scAmp[y] = 0.5 + rand() * 0.5;
    }
  }
  // lattice is sampled on exact rows (crisp 1px streaks), so only the U
  // interpolation is needed: precompute its indices/weights once.
  const ux0 = new Int32Array(S);
  const ux1 = new Int32Array(S);
  const uf = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    const fx = (x / S) * L.cx;
    const i = Math.floor(fx);
    const f = fx - i;
    ux0[x] = i % L.cx;
    ux1[x] = (i + 1) % L.cx;
    uf[x] = f * f * (3 - 2 * f);
  }
  const La = L.a;
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    const base = 0.5 + 0.5 * noise1(smooth, v * 32);
    const row = y * L.cx;
    let o = y * S * 4;
    for (let x = 0; x < S; x++, o += 4) {
      const a0 = La[row + ux0[x]];
      const lv = a0 + (La[row + ux1[x]] - a0) * uf[x];
      let val = 0.38 * base + 0.37 * lv + 0.25 * fine[y];
      if (scLen[y] > 0) {
        const t = ((x - scStart[y] + S) % S) / scLen[y];
        if (t < 1) val += scAmp[y] * 0.35 * Math.sin(Math.PI * t);
      }
      const r = 0.25 + 0.2 * clamp(val, 0, 1);
      const g = (r * 255 + 0.5) | 0;
      d[o] = g;
      d[o + 1] = g;
      d[o + 2] = g;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { roughnessMap: finishTexture(canvas, false, 'brushedBrass.roughness') };
}
