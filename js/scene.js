import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Açılıştaki 3D waterfall mutfak adası.
// Parmakla sağa-sola sürükleyince döner, telefon eğilince hafifçe döner (jiroskop),
// sayfa kaydırılınca küçük bir dönüş yapar. Taş çipine dokununca ada o taşa bürünür.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - t, 3);

export async function createScene(canvas, { stones, mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;

  const camera = new THREE.PerspectiveCamera(mobile ? 34 : 30, innerWidth / innerHeight, 0.1, 60);
  // mobilde ada ekranın üst kısmında durur, metin altta kalır
  const OFF = mobile ? .235 : 0;
  const view = () => { if (OFF) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * OFF, innerWidth, innerHeight); else camera.clearViewOffset(); camera.updateProjectionMatrix(); };
  // ekran ne kadar darsa kamera o kadar uzakta: ada her telefonda ekrana sığar
  const CAM = { x: 0, y: 2, z: 8, ly: .62 };
  const fit = () => {
    const span = mobile ? 3.9 : 4.6, fh = Math.tan(camera.fov * Math.PI / 360);
    CAM.z = Math.max(mobile ? 7.6 : 11.5, span / (2 * fh * camera.aspect));
    CAM.y = .55 + CAM.z * .3;
  };
  fit(); camera.position.set(CAM.x, CAM.y, CAM.z); camera.far = CAM.z * 4; view();

  // ışıklar: sıcak ana ışık gölgeli, altın kontra ışık, yumuşak dolgu
  const key = new THREE.DirectionalLight(0xfff0db, 2.4);
  key.position.set(3.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
  key.shadow.radius = 6; key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9b77a, 1.5); rim.position.set(-5, 2.5, -4); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x1a1612, .45));

  // doku yükleyici
  const loader = new THREE.TextureLoader();
  const cache = {};
  const tex = url => cache[url] || (cache[url] = new Promise(res => loader.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t);
  }, undefined, () => res(null))));
  // aynı görselden, yüzey oranına göre kırpılmış kopya (damar esnemesin)
  const crop = (t, w, h, ox = 0) => {
    const c = t.clone(); c.needsUpdate = true;
    const ar = w / h;
    if (ar >= 1) { c.repeat.set(1, 1 / ar); c.offset.set(0, (1 - 1 / ar) / 2); }
    else { c.repeat.set(ar, 1); c.offset.set(clamp(ox, 0, 1 - ar), 0); }
    return c;
  };

  // ---------------- ada ----------------
  const W = 3.0, D = 1.25, H = .92, T = .065;           // genişlik, derinlik, yükseklik, plaka kalınlığı
  const island = new THREE.Group();
  const root = new THREE.Group(); root.add(island); scene.add(root);
  if (!mobile) root.position.x = 2.45;

  const stoneMat = () => new THREE.MeshPhysicalMaterial({ roughness: .16, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.15, color: 0xffffff });
  const topMat = stoneMat(), sideMatL = stoneMat(), sideMatR = stoneMat(), edgeMat = stoneMat();
  const top = new THREE.Mesh(new RoundedBoxGeometry(W, T, D, 3, .012), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
  top.position.y = H - T / 2;
  const sideGeo = new RoundedBoxGeometry(T, H - T, D, 3, .012);
  const sideL = new THREE.Mesh(sideGeo, [sideMatL, sideMatL, edgeMat, edgeMat, edgeMat, edgeMat]);
  const sideR = new THREE.Mesh(sideGeo, [sideMatR, sideMatR, edgeMat, edgeMat, edgeMat, edgeMat]);
  sideL.position.set(-W / 2 + T / 2, (H - T) / 2, 0);
  sideR.position.set(W / 2 - T / 2, (H - T) / 2, 0);
  // dolap gövdesi: koyu mat ceviz tonu, ön yüzde ince pirinç tutamak çizgisi
  const wood = new THREE.MeshStandardMaterial({ color: 0x241e19, roughness: .62, metalness: .05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - .02, H - T - .1, D - .22), wood);
  body.position.set(0, (H - T - .1) / 2 + .1, -.05);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a066, roughness: .28, metalness: 1, envMapIntensity: 1.2 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(W - .5, .014, .014), brass);
  handle.position.set(0, H - T - .09, D / 2 - .16);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * T - .1, .1, D - .3), new THREE.MeshStandardMaterial({ color: 0x0e0c0a, roughness: .9 }));
  plinth.position.set(0, .05, -.08);
  // kapak çizgileri
  for (let k = 1; k < 4; k++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(.006, H - T - .14, .006), new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 1 }));
    g.position.set(-W / 2 + T + k * (W - 2 * T) / 4, (H - T - .1) / 2 + .1, D / 2 - .16 + .004);
    island.add(g);
  }
  [top, sideL, sideR, body, handle, plinth].forEach(m => { m.castShadow = true; m.receiveShadow = true; island.add(m); });

  // tabureler (oturma tarafı arkada, ada çevrilince görünür)
  const leather = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: .55 });
  const stool = x => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.17, .16, .055, 32), leather); seat.position.y = .66;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.13, .008, 8, 40), brass); ring.rotation.x = Math.PI / 2; ring.position.y = .26;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .64, 16), brass); leg.position.y = .33;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.15, .16, .018, 32), brass); foot.position.y = .01;
    [seat, ring, leg, foot].forEach(m => { m.castShadow = true; g.add(m); });
    g.position.set(x, 0, -D / 2 - .32);
    return g;
  };
  island.add(stool(-.65), stool(.65));

  // sarkıt lambalar: ince kablo + pirinç kubbe + sıcak ampul ışığı
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 2.2 });
  const lamp = x => {
    const g = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    cord.position.y = 2.95;
    const shade = new THREE.Mesh(new THREE.SphereGeometry(.16, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brass);
    shade.material = brass.clone(); shade.material.side = THREE.DoubleSide;
    shade.position.y = 2.15;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), bulbMat); bulb.position.y = 2.12;
    g.add(cord, shade, bulb);
    const pl = new THREE.PointLight(0xffd29a, .9, 3.2, 2); pl.position.y = 2.05; g.add(pl);
    g.position.x = x;
    return g;
  };
  const lamps = new THREE.Group(); lamps.add(lamp(-.7), lamp(.7)); island.add(lamps);

  // zemin: sadece gölge + altın tonlu yumuşak hale (kenarlar arka plana karışır)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: .5 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const gx = gc.getContext('2d'), grd = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(217,183,122,.30)'); grd.addColorStop(.45, 'rgba(217,183,122,.08)'); grd.addColorStop(1, 'rgba(217,183,122,0)');
  gx.fillStyle = grd; gx.fillRect(0, 0, 256, 256);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .002; root.add(halo);

  // altın toz
  const pg = new THREE.BufferGeometry(), PC = mobile ? 180 : 420, pos = new Float32Array(PC * 3);
  for (let i = 0; i < PC; i++) { pos[i * 3] = (Math.random() - .5) * 14; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - .5) * 8 - 1; }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd9b77a, size: .025, transparent: true, opacity: .6, depthWrite: false }));
  scene.add(dust);

  // ---------------- taş giydirme ----------------
  let curIdx = 0;
  async function apply(i) {
    const t = await tex(stones[i]); if (!t) return;
    topMat.map = crop(t, W, D);
    sideMatL.map = crop(t, D, H, 0);
    sideMatR.map = crop(t, D, H, .3);
    edgeMat.map = crop(t, 1, 1);
    [topMat, sideMatL, sideMatR, edgeMat].forEach(m => { m.needsUpdate = true; });
  }
  await apply(0);
  stones.slice(1).forEach(tex);   // diğerlerini arkadan yükle

  // ---------------- etkileşim ----------------
  let yaw = -.55, vel = 0, gyro = 0, gyroT = 0, pitch = 0, pitchT = 0, intro = 0, active = true, onDrag = null, pulse = 0;
  const hero$ = document.querySelector('.hero');
  const inZone = (x, y, el) => !(el && el.closest && el.closest('a,button,.h3d__chips')) && (mobile ? y < innerHeight * .5 : x > innerWidth * .4);
  let lx = null, lt = 0;
  const start = (x, y, el) => { if (inZone(x, y, el)) { lx = x; lt = performance.now(); vel = 0; } };
  const move = x => {
    if (lx === null) return;
    const now = performance.now(), dx = x - lx;
    const d = dx * (mobile ? .011 : .007);
    yaw += d; vel = d / Math.max(8, now - lt) * 16;
    lx = x; lt = now; onDrag && onDrag();
  };
  const end = () => { lx = null; };
  hero$.addEventListener('touchstart', e => { const t = e.touches[0]; start(t.clientX, t.clientY, e.target); askGyro(); }, { passive: true });
  hero$.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true });
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  hero$.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') start(e.clientX, e.clientY, e.target); });
  addEventListener('pointermove', e => { if (e.pointerType !== 'touch') move(e.clientX); });
  addEventListener('pointerup', end);
  let mx = 0, my = 0;
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; } });

  // telefon eğimi (iOS ilk dokunuşta izin ister)
  let base = null, gyroOn = false;
  function onOri(e) {
    if (e.gamma == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    gyroT = clamp((e.gamma - base.g) / 28, -1, 1) * .75;
    pitchT = clamp((e.beta - base.b) / 30, -1, 1) * .35;
    gyroOn = true;
  }
  function askGyro() {
    if (gyroOn || askGyro.done) return; askGyro.done = true;
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') D.requestPermission().then(s => { if (s === 'granted') addEventListener('deviceorientation', onOri); }).catch(() => {});
  }
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') addEventListener('deviceorientation', onOri);

  // ---------------- döngü ----------------
  const clock = new THREE.Clock();
  const tgt = new THREE.Vector3(0, CAM.ly, 0);
  function frame() {
    requestAnimationFrame(frame);
    if (!active) return;
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    intro = Math.min(1, intro + dt * .7);
    // açılışta ada yarım tur dönerek yerine oturur
    const iy = (1 - ease(intro)) * -2.2;
    if (lx === null) { yaw += vel; vel *= .93; }
    gyro += (gyroT - gyro) * .08; pitch += (pitchT - pitch) * .08;
    island.rotation.y = yaw + iy + gyro + mx * .35;
    const s = (.82 + .18 * ease(intro)) * (1 + Math.sin(Math.min(1, pulse) * Math.PI) * .035);
    island.scale.setScalar(s);
    if (pulse < 1) pulse += dt * 2.2;
    lamps.children.forEach((l, k) => { l.rotation.z = Math.sin(t * .9 + k) * .025; });
    dust.rotation.y = t * .015;
    camera.position.x = CAM.x + mx * .5; camera.position.z = CAM.z;
    camera.position.y = CAM.y + pitch + my * -.3;
    camera.lookAt(root.position.x * (mobile ? 1 : .55), tgt.y, 0);
    renderer.render(scene, camera);
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; fit(); camera.far = CAM.z * 4; view();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  return {
    setProgress() {},
    setLabels() {},
    setActive(v) { active = v; },
    nudge(dy) { vel += clamp(dy * .0004, -.02, .02); },
    onDrag(fn) { onDrag = fn; },
    // taş değiştir: kısa nabız + çeyrek tur
    async setStone(url) {
      let i = stones.indexOf(url);
      if (i < 0) { stones.push(url); i = stones.length - 1; }
      if (i === curIdx) return;
      curIdx = i; pulse = 0; vel += .09;
      await apply(i);
    },
  };
}
