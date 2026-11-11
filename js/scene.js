import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

export async function createScene(canvas, { stones, mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0a09, 9, 22);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(mobile ? 50 : 38, innerWidth / innerHeight, 0.1, 60);
  camera.position.set(0, 0, mobile ? 11 : 10);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9b77a, 1.6); rim.position.set(-6, -2, -4); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, .25));

  const loader = new THREE.TextureLoader();
  const cache = {};
  const tex = id => cache[id] || (cache[id] = new Promise(res => loader.load(id, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
  }, undefined, () => res(null))));

  const maps = await Promise.all(stones.map(tex));
  const geo = new RoundedBoxGeometry(2.3, 3.5, 0.09, 4, 0.03);
  const group = new THREE.Group(); scene.add(group);
  const slabs = maps.map((map, i) => {
    const mat = new THREE.MeshPhysicalMaterial({ map, roughness: .22, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.1 });
    const m = new THREE.Mesh(geo, mat);
    m.userData = { i, cur: { p: new THREE.Vector3(0, -8, 0), r: new THREE.Euler(), s: 1 } };
    m.position.set(0, -8 - i, 0);
    group.add(m); return m;
  });
  const N = slabs.length, mid = (N - 1) / 2;
  const sx = mobile ? .52 : 1;

  // gold dust particles
  const pg = new THREE.BufferGeometry(), PC = mobile ? 260 : 600, pos = new Float32Array(PC * 3);
  for (let i = 0; i < PC; i++) { pos[i * 3] = (Math.random() - .5) * 22; pos[i * 3 + 1] = (Math.random() - .5) * 14; pos[i * 3 + 2] = (Math.random() - .5) * 10 - 2; }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd9b77a, size: .035, transparent: true, opacity: .7, depthWrite: false }));
  scene.add(dust);

  // keyframes: 0 hero fan · 1 manifesto scatter · 2 exit
  // 0 = dönen 3D halka: tüm taşlar yuvarlak bir çember üzerinde, her biri farklı salınımla
  // 0 = dönen 3D halka · 1 = halka aşağı iner · 2 = tamamen aşağıda, ekrandan çıkar
  let spin = 0, tNow = 0, scrollSpin = 0;
  const RING = mobile ? { cx: 0, cy: 0, cz: -2.4, R: 2.2, s: .4 } : { cx: 2.7, cy: .15, cz: -1.6, R: 2.9, s: .66 };
  // kamera halkayla aynı yükseklikte: bütün taşlar tek hizada görünür; mobilde görüntü yukarı kaydırılır
  const OFF = mobile ? .3 : 0;
  const view = () => { if (OFF) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * OFF, innerWidth, innerHeight); else camera.clearViewOffset(); };
  view();
  const ring = (i, dy, sMul, tilt) => {
    const a = i / N * Math.PI * 2 + spin + scrollSpin;
    const wave = 0;
    return {
      p: [RING.cx + Math.sin(a) * RING.R, RING.cy + wave + dy - i * tilt * .25, RING.cz + Math.cos(a) * RING.R],
      r: [0, a, 0],
      s: RING.s * sMul * (1 + Math.cos(a) * .12),
    };
  };
  const K = [i => ring(i, 0, 1, 0)];

  let prog = 0, active = true, mx = 0, my = 0, flip = null, hero = 0, dragV = 0, lastFlip = 0, labelEls = null;
  const tmpV = new THREE.Vector3();
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; } });
  // parmakla / fareyle yatay sürükleyince halka döner
  let lx = null;
  const hero$ = document.querySelector('.hero');
  let onDrag = null;
  const inRing = (x, y, el) => !(el && el.closest && el.closest('a,button')) && (mobile ? y < innerHeight * .52 : x > innerWidth * .42);
  hero$ && hero$.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && inRing(e.clientX, e.clientY, e.target)) lx = e.clientX; });
  addEventListener('pointermove', e => { if (lx === null || e.pointerType === 'touch') return; dragV += (e.clientX - lx) * .0009; lx = e.clientX; onDrag && onDrag(); });
  addEventListener('pointerup', () => { lx = null; }); addEventListener('pointercancel', () => { lx = null; });
  hero$ && hero$.addEventListener('touchstart', e => { const t = e.touches[0]; lx = inRing(t.clientX, t.clientY, e.target) ? t.clientX : null; }, { passive: true });
  hero$ && hero$.addEventListener('touchmove', e => { if (lx === null) return; dragV += (e.touches[0].clientX - lx) * .0012; lx = e.touches[0].clientX; onDrag && onDrag(); }, { passive: true });
  hero$ && hero$.addEventListener('touchend', () => { lx = null; });

  function target(i, s) {
    const a = Math.min(K.length - 1, Math.floor(s)), b = Math.min(K.length - 1, a + 1), t = smooth(Math.min(1, s - a));
    const A = K[a](i), B = K[b](i);
    return { p: A.p.map((v, k) => lerp(v, B.p[k], t)), r: A.r.map((v, k) => lerp(v, B.r[k], t)), s: lerp(A.s, B.s, t) };
  }

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!active) return;
    const t = clock.getElapsedTime(), dt = Math.min(.05, t - tNow);
    tNow = t;
    dragV *= .94;
    spin += dragV;
    // her 4 saniyede bir taş kendi ekseninde takla atar
    if (false) { lastFlip = t; const k = (Math.random() * N) | 0; flip = { i: k, t0: performance.now(), swapped: true, axis: Math.random() < .5 ? 'x' : 'y' }; }
    hero = Math.min(1, hero + .012);                 // intro fly-in
    const intro = smooth(hero);
    slabs.forEach((m, i) => {
      const T = target(i, prog);
      const fl = 1 - Math.min(1, Math.max(0, intro * 1.4 - i * .07));
      m.position.x += (T.p[0] - m.position.x) * .07;
      m.position.y += (T.p[1] - fl * 9 - m.position.y) * .07;
      m.position.z += (T.p[2] - m.position.z) * .07;
      let ry = T.r[1] + mx * .25, rx = T.r[0];
      if (flip && flip.i === i) {
        const ft = Math.min(1, (performance.now() - flip.t0) / 1300);
        if (flip.axis === 'x') rx += smooth(ft) * Math.PI * 2; else ry += smooth(ft) * Math.PI * 2;
        if (ft > .5 && !flip.swapped) { flip.swapped = true; tex(flip.id).then(tx => { if (tx) { m.material.map = tx; m.material.needsUpdate = true; } }); }
        if (ft >= 1) flip = null;
      }
      // halkada açı sürekli artar; farkı en kısa yoldan kapat
      const dy = Math.atan2(Math.sin(ry - m.rotation.y), Math.cos(ry - m.rotation.y));
      m.rotation.x += (rx - m.rotation.x) * .08;
      m.rotation.y += dy * .12;
      m.rotation.z += (T.r[2] - m.rotation.z) * .07;
      const sc = m.scale.x + (T.s - m.scale.x) * .07; m.scale.setScalar(sc);
    });
    // taş isimleri: her plakanın alt kenarının ekran konumuna yerleştir
    if (labelEls) {
      const W = innerWidth, H = innerHeight;
      slabs.forEach((m, i) => {
        const el = labelEls[i]; if (!el) return;
        tmpV.set(m.position.x, m.position.y - 1.75 * m.scale.y - .22, m.position.z).project(camera);
        const x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
        const front = Math.cos(i / N * Math.PI * 2 + spin + scrollSpin);          // 1 = öne bakan
        const op = Math.max(0, Math.min(1, (front + .35) * 1.4)) * Math.max(0, 1 - prog * 1.3) * intro;
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translate(${x}px,${y}px) translate(-50%,0) scale(${(.8 + front * .2).toFixed(3)})`;
        el.style.zIndex = Math.round((front + 1) * 10);
      });
    }
    dust.rotation.y = t * .02;
    camera.position.x += (mx * .6 - camera.position.x) * .04;
    camera.position.y = RING.cy;
    camera.lookAt(0, RING.cy, 0);
    renderer.render(scene, camera);
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; view(); camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  return {
    setProgress() {},
    nudge(dy) { dragV += Math.max(-.03, Math.min(.03, dy * .00045)); },
    onDrag(fn) { onDrag = fn; },
    setLabels(els) { labelEls = els; },
    setActive(v) { active = v; },
    setStone() {},
  };
}
