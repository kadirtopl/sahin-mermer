import * as THREE from 'three';

// Sıcak, aydınlık lüks mutfak ortamı (yansıma/aydınlatma) + temas gölgesi + lamba parıltısı.
// Warm upscale-kitchen "light box" for glossy polished marble/quartz, plus small canvas helpers.
//
// Env space: capture point = origin ~ countertop height, camera assumed on +Z looking toward -Z.
// A horizontal top under such a camera reflects the BACK wall at ~10-20 deg elevation, so the
// back wall carries a tall glazed garden door (the broad soft streak on the top); the big left
// window lights/reflects in the side faces; the low front bounce panel shows in the front face.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// @layout-begin  (plain data; colors are sRGB hex, gains are linear HDR multipliers)
const LAYOUT = {
  room: { x0: -7, x1: 7, y0: -2.4, y1: 4.8, z0: -10, z1: 6 },
  wall: { color: '#f0e3cf', gain: 0.9, low: 0.4, mul: { px: 0.84, nx: 1.0, pz: 0.9, nz: 0.97 } },
  ceil: { color: '#f5ece0', gain: 0.5 },
  floor: { color: '#cbb9a1', gain: 0.5 },
  // n: plane axis; at: coordinate on it; a/b: extents  (n 'x' -> a=z,b=y | 'y' -> a=x,b=z | 'z' -> a=x,b=y)
  // grad: [bottomMul, topMul] vertical gradient (daylight: brighter sky at top)
  rects: [
    // large daylight window, left wall (soft, slightly cool-neutral)
    { n: 'x', at: -6.95, a: [-9.6, 1.2], b: [0.45, 4.25], color: '#eef2fa', gain: 4.6, grad: [0.7, 1.12] },
    // tall glazed garden door behind the island (gives the broad streak on the countertop top)
    { n: 'z', at: -9.95, a: [-1.9, 0.3], b: [-2.35, 4.25], color: '#eef2fa', gain: 5.0, grad: [0.55, 1.1] },
    // window/door frames + mullions (dark bronze; contrast lines = "polished" read)
    { n: 'x', at: -6.9, a: [-9.6, 1.2], b: [0.38, 0.52], color: '#3b3027', gain: 0.32 },
    { n: 'x', at: -6.9, a: [-9.6, 1.2], b: [4.18, 4.32], color: '#3b3027', gain: 0.32 },
    { n: 'x', at: -6.9, a: [-6.08, -5.92], b: [0.45, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'x', at: -6.9, a: [-2.48, -2.32], b: [0.45, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'x', at: -6.9, a: [1.12, 1.28], b: [0.45, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'x', at: -6.9, a: [-9.6, 1.2], b: [3.3, 3.4], color: '#3b3027', gain: 0.32 },
    { n: 'z', at: -9.9, a: [-2.04, -1.9], b: [-2.35, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'z', at: -9.9, a: [0.3, 0.44], b: [-2.35, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'z', at: -9.9, a: [-2.04, 0.44], b: [4.25, 4.39], color: '#3b3027', gain: 0.32 },
    { n: 'z', at: -9.9, a: [-0.84, -0.76], b: [-2.35, 4.25], color: '#3b3027', gain: 0.32 },
    { n: 'z', at: -9.9, a: [-1.9, 0.3], b: [3.42, 3.5], color: '#3b3027', gain: 0.32 },
    // two long ceiling softbox strips (warm white), running front-to-back
    { n: 'y', at: 4.76, a: [-2.1, -1.5], b: [-9.3, 3.8], color: '#fff0da', gain: 5.5 },
    { n: 'y', at: 4.76, a: [1.5, 2.1], b: [-9.3, 3.8], color: '#fff0da', gain: 5.5 },
    // dim warm bounce panel near the floor (front wall, behind camera) -> warm sheen on front faces
    { n: 'z', at: 5.95, a: [-5.2, 5.2], b: [-2.3, -0.55], color: '#ffe0b6', gain: 1.45 },
    // faint warm-gold accent panel behind (back wall, right of the door)
    { n: 'z', at: -9.95, a: [2.2, 6.2], b: [-0.15, 3.3], color: '#e8b86e', gain: 1.0 },
  ],
  // low-contrast furniture blocks (like RoomEnvironment's boxes): horizon line + side contrast
  boxes: [
    { min: [-7, -2.4, -10], max: [-2.1, -0.25, -9.1], color: '#8a7764', gain: 0.42 },
    { min: [0.5, -2.4, -10], max: [7, -0.25, -9.1], color: '#8a7764', gain: 0.42 },
    { min: [6.15, -2.4, -9.0], max: [7, 4.35, -4.4], color: '#76604c', gain: 0.4 },
  ],
};
// @layout-end

const _c = new THREE.Color();
const lin = hex => _c.set(hex); // sRGB hex -> linear working color (ColorManagement)

/**
 * Builds a warm interior PMREM environment for glossy stone.
 * @returns {THREE.Texture} PMREM texture (use as scene.environment or material.envMap).
 * Its dispose() also frees the underlying render target.
 */
export function createStudioEnvironment(renderer, { intensity = 1 } = {}) {
  const k = Number.isFinite(intensity) ? Math.max(0, intensity) : 1;
  const L = LAYOUT, R = L.room;
  const scene = new THREE.Scene();

  // room: inverted box with vertex-colored ivory walls (height gradient), ceiling, floor
  const w = R.x1 - R.x0, h = R.y1 - R.y0, d = R.z1 - R.z0;
  const cy = (R.y0 + R.y1) / 2;
  const roomGeo = new THREE.BoxGeometry(w, h, d, 1, 10, 1);
  roomGeo.deleteAttribute('uv');
  const pos = roomGeo.attributes.position, nor = roomGeo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const wallC = lin(L.wall.color).clone(), ceilC = lin(L.ceil.color).clone(), floorC = lin(L.floor.color).clone();
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    let r, g, b, f;
    if (ny > 0.5) { f = L.ceil.gain; r = ceilC.r; g = ceilC.g; b = ceilC.b; }
    else if (ny < -0.5) { f = L.floor.gain; r = floorC.r; g = floorC.g; b = floorC.b; }
    else {
      const t = clamp((pos.getY(i) + cy - R.y0) / h, 0, 1);
      const m = L.wall.mul;
      const side = nx > 0.5 ? m.px : nx < -0.5 ? m.nx : nz > 0.5 ? m.pz : m.nz;
      f = L.wall.gain * side * (L.wall.low + (1 - L.wall.low) * (1 - (1 - t) * (1 - t)));
      r = wallC.r; g = wallC.g; b = wallC.b;
    }
    col[i * 3] = r * f; col[i * 3 + 1] = g * f; col[i * 3 + 2] = b * f;
  }
  roomGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const roomMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  roomMat.color.setScalar(k);
  const room = new THREE.Mesh(roomGeo, roomMat);
  room.position.set((R.x0 + R.x1) / 2, cy, (R.z0 + R.z1) / 2);
  scene.add(room);

  // shared unit planes: flat, and one with a vertical vertex-color gradient per distinct grad
  const flatPlane = new THREE.PlaneGeometry(1, 1);
  const gradPlanes = new Map();
  const gradPlane = ([b0, t0]) => {
    const key = b0 + ':' + t0;
    if (!gradPlanes.has(key)) {
      const g = new THREE.PlaneGeometry(1, 1, 1, 4);
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) + 0.5, v = b0 + (t0 - b0) * t;
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      gradPlanes.set(key, g);
    }
    return gradPlanes.get(key);
  };

  for (const e of L.rects) {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: !!e.grad });
    mat.color.copy(lin(e.color)).multiplyScalar(e.gain * k); // HDR emitter (>1), like RoomEnvironment
    const m = new THREE.Mesh(e.grad ? gradPlane(e.grad) : flatPlane, mat);
    const ca = (e.a[0] + e.a[1]) / 2, cb = (e.b[0] + e.b[1]) / 2;
    const sa = e.a[1] - e.a[0], sb = e.b[1] - e.b[0];
    if (e.n === 'x') { m.position.set(e.at, cb, ca); m.rotation.y = Math.PI / 2; }
    else if (e.n === 'y') { m.position.set(ca, e.at, cb); m.rotation.x = -Math.PI / 2; }
    else { m.position.set(ca, cb, e.at); }
    m.scale.set(sa, sb, 1);
    scene.add(m);
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.deleteAttribute('uv');
  for (const bx of L.boxes) {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.copy(lin(bx.color)).multiplyScalar(bx.gain * k);
    const m = new THREE.Mesh(boxGeo, mat);
    m.position.set((bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2);
    m.scale.set(bx.max[0] - bx.min[0], bx.max[1] - bx.min[1], bx.max[2] - bx.min[2]);
    scene.add(m);
  }

  const gen = new THREE.PMREMGenerator(renderer);
  const rt = gen.fromScene(scene, 0.035, 0.1, 50);
  gen.dispose();

  // free temp scene resources (render target texture stays valid)
  const geos = new Set(), mats = new Set();
  scene.traverse(o => { if (o.isMesh) { geos.add(o.geometry); mats.add(o.material); } });
  geos.forEach(g => g.dispose());
  mats.forEach(m => m.dispose());

  const tex = rt.texture;
  tex.name = 'StudioEnvironment';
  // a render-target texture's own dispose() frees nothing; route it to the target
  tex.dispose = () => rt.dispose();
  return tex;
}

// --- contact shadow -------------------------------------------------------

// signed distance to a centered rounded rect (half sizes hx, hy, corner radius r)
function sdRoundRect(px, py, hx, hy, r) {
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Soft rounded-rect contact/AO shadow for a transparent plane under furniture.
 * The texture spans the WHOLE plane: size the plane a little larger than the object
 * (e.g. object + 0.2-0.3 m per side) and pass aspect = planeWidth / planeDepth, so the
 * falloff band has the same world width on both axes. Edges are exactly transparent.
 *
 * Mask encoding: canvas RGB = white, A = mask, uploaded premultiplied (premultiplyAlpha = true),
 * so the GPU texel is (m, m, m, m): G == A == mask. Works as `alphaMap` (reads .g) with any
 * material color, or as `map` ONLY together with material color 0x000000.
 * userData: core = {x,y} fraction of plane width/depth at full opacity; band = falloff width as a
 * fraction of the shorter plane side; footprint = {x,y} suggested object coverage of the plane.
 */
export function createContactShadowTexture({ size = 256, softness = 0.5, opacity = 0.7, aspect = 1 } = {}) {
  const S = clamp(Math.round(Number(size) || 256), 16, 1024);
  const soft = clamp(Number.isFinite(softness) ? softness : 0.5, 0, 1);
  const op = clamp(Number.isFinite(opacity) ? opacity : 0.7, 0, 1);
  const asp = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1, 1 / 16, 16);

  // plane in normalized units (shorter side = 1): world-isotropic falloff on a stretched canvas
  const PW = asp >= 1 ? asp : 1, PD = asp >= 1 ? 1 : 1 / asp;
  const guard = 1.5 * Math.max(PW, PD) / S;            // >= 1.5 px fully transparent border
  const band = 0.1 + 0.22 * soft;                     // falloff width (fraction of shorter side)
  const hx = Math.max(PW / 2 - guard - band, 0);      // full-opacity core half sizes
  const hy = Math.max(PD / 2 - guard - band, 0);
  const cr = Math.min(hx, hy) * 0.25;
  const inv = 1 / band;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S), px = img.data;
  for (let y = 0; y < S; y++) {
    const py = ((y + 0.5) / S - 0.5) * PD;
    for (let x = 0; x < S; x++) {
      const t = sdRoundRect(((x + 0.5) / S - 0.5) * PW, py, hx, hy, cr) * inv;
      let v;
      if (t <= 0) v = 1;
      else if (t >= 1) v = 0;
      else {
        const u = t < 0.5 ? 2 * t : 1;
        // broad AO (smoothstep over the band) + tighter contact layer (first half of the band)
        v = 0.6 * (1 - t * t * (3 - 2 * t)) + 0.4 * (1 - u * u * (3 - 2 * u));
      }
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(op * v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;  // data mask: no sRGB decode of G when used as alphaMap
  tex.premultiplyAlpha = true;          // exact (m,m,m,m) texels from the premultiplied canvas
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.userData.core = { x: (2 * hx) / PW, y: (2 * hy) / PD };
  tex.userData.band = band;
  tex.userData.footprint = { x: (2 * (hx + 0.3 * band)) / PW, y: (2 * (hy + 0.3 * band)) / PD };
  tex.needsUpdate = true;
  return tex;
}

// --- pendant glow -----------------------------------------------------------

/** Radial soft glow (bright tinted core, smooth falloff to 0) for additive sprites. */
export function createGlowTexture({ size = 128, color = '#ffd9a0' } = {}) {
  const S = clamp(Math.round(Number(size) || 128), 8, 1024);
  const hex = new THREE.Color(color).getHex(); // sRGB 0xRRGGBB
  const cr = (hex >> 16) & 255, cg = (hex >> 8) & 255, cb = hex & 255;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const c = S / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  const N = 32;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const win = (1 - t * t) * (1 - t * t);
    const q1 = t / 0.13, q2 = t / 0.45, q3 = t / 0.1;
    const alpha = (0.55 * Math.exp(-q1 * q1) + 0.45 * Math.exp(-q2 * q2)) * win;
    const wht = 0.8 * Math.exp(-q3 * q3); // whiter hot core
    const r = Math.round(cr + (255 - cr) * wht), g = Math.round(cg + (255 - cg) * wht), b = Math.round(cb + (255 - cb) * wht);
    grad.addColorStop(t, `rgba(${r},${g},${b},${i === N ? 0 : alpha.toFixed(4)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
