import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStudioEnvironment, createContactShadowTexture, createGlowTexture } from './s3d/env.js?v=13';
import { oakFloorTexture, walnutTexture, plasterTexture, brushedBrassTexture } from './s3d/textures.js?v=13';
import { createStoneMaterial, setStoneMap, wipeStones } from './s3d/stoneMat.js?v=13';

// Açılıştaki gerçekçi 3D mutfak.
// - Açılışta kamera cilalı taşın yüzeyine çok yakından başlar, geri çekilerek mutfağın tamamını gösterir.
// - Parmakla sağa-sola kaydırınca mutfağın etrafında gezinir; telefon eğilince bakış açısı hafifçe kayar.
// - Taş seçilince yeni taş, ışıklı bir çizgiyle bütün tezgah ve arka panele yayılır.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export async function createScene(canvas, { stones, mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
  renderer.setClearColor(0xf7f2ea, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.environment = createStudioEnvironment(renderer, { intensity: 1 });

  // ---------------- kamera ve çerçeve ----------------
  // Mobilde 3D ekranın üst %60'ında çizilir; altta yazılar ve butonlar durur.
  let K = mobile ? .6 : 1;
  const camera = new THREE.PerspectiveCamera(50, 1, .05, 40);
  const HF = mobile ? 54 : 52;                       // yatay görüş açısı (derece)
  let cw = 0, ch = 0;
  const frame = () => {
    const w = cw, h = ch * K;
    camera.aspect = w / h;
    const f = 2 * Math.atan(Math.tan(HF * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
    // kısa telefon ekranında biraz geri çekil ve görüntüyü aşağı kaydır: duvardaki tabela üst menünün altında kalmasın
    const short = mobile ? clamp((420 - h) / 120, 0, 1) : 0;
    camera.fov = clamp(Math.max(f, f + (58 - f) * short), 28, 70);
    // masaüstünde mutfak sağa kayar, sol taraf yazıya kalır
    if (!mobile) camera.setViewOffset(w, h, -w * .17, 0, w, h);
    else if (short > 0) camera.setViewOffset(w, h, 0, -28 * short, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  // tampon ve CSS kutusu her zaman pencerenin görünen ölçüsü (100vh ile şişmesin)
  // mobilde 3D, taş çiplerinin hemen altına kadar çizilir (kısa ekranlarda ada çiplerin arkasında kalmasın)
  const pickTop = h => { const pk = document.querySelector('.h3d__pick'); const r = pk && pk.getBoundingClientRect(); return r && r.height ? r.top + scrollY : h * .47; };
  const size = () => {
    const w = innerWidth, h = innerHeight;
    const k = mobile ? clamp((pickTop(h) + 44) / h, .4, .62) : 1;
    if (w === cw && h === ch && k === K) return;
    cw = w; ch = h; K = k; renderer.setSize(w, h); frame();
  };
  size();
  const TARGET = new THREE.Vector3(0, .78, -.15);
  const REST = { r: mobile ? 4.55 : 4.9, pitch: .27 };

  // ---------------- ışık ----------------
  // pencereden gelen gün ışığı (gölgeli) + ortam yansımaları (env) + sarkıt lambalar
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.6);
  sun.position.set(-5.5, 4.6, 2.2);
  sun.target.position.set(.3, 0, -.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3.5, bottom: -2.5, near: .5, far: 16 });
  sun.shadow.radius = 5; sun.shadow.bias = -.0005; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xfff8f0, 0xb9a88f, .35);
  scene.add(hemi);

  // ---------------- dokular ----------------
  const loader = new THREE.TextureLoader();
  const cache = {};
  const tex = url => cache[url] || (cache[url] = new Promise(res => loader.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; res(t);
  }, undefined, () => { delete cache[url]; res(null); })));
  // taş dokusu gerçek ölçüde: bir doku ~1.8 m taşı temsil eder; ayna tekrarı = ortadan simetrik (book-match)
  const SLAB = 1.8;
  const fit = (base, f) => {
    const c = base.clone();
    c.wrapS = c.wrapT = THREE.MirroredRepeatWrapping;
    c.repeat.set(f.w / SLAB, f.h / SLAB);
    c.offset.set(f.ox ?? (1 - f.w / SLAB / 2), f.oy ?? 0);
    c.anisotropy = maxAniso;
    c.needsUpdate = true;
    c.updateMatrix();
    return c;
  };

  const oak = oakFloorTexture({ size: 1024, planks: 7, seed: 7 });
  [oak.map, oak.roughnessMap].forEach(t => { t.repeat.set(4.4, 3.4); t.anisotropy = maxAniso; });
  const plaster = plasterTexture({ size: 512, seed: 5, color: '#efe7dc' });
  plaster.map.repeat.set(3, 2);
  const walnut = walnutTexture({ size: 512, seed: 3, tone: 'dark' });
  walnut.map.repeat.set(2, 1);
  const brushed = brushedBrassTexture({ size: 256 });

  // ---------------- malzemeler ----------------
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: oak.map, roughnessMap: oak.roughnessMap, roughness: 1, envMapIntensity: .55 }),
    wall: new THREE.MeshStandardMaterial({ map: plaster.map, roughness: .92, envMapIntensity: .35 }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0xd8cfc1, roughness: .42, envMapIntensity: .6 }),
    walnut: new THREE.MeshStandardMaterial({ map: walnut.map, roughness: .55, envMapIntensity: .55 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a066, metalness: 1, roughness: .32, roughnessMap: brushed.roughnessMap, envMapIntensity: 1.25 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: .58, envMapIntensity: .5 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xf4efe8, roughness: .3, clearcoat: .6, envMapIntensity: .8 }),
    shade: new THREE.MeshPhysicalMaterial({ color: 0xfff5e6, roughness: .15, transparent: true, opacity: .55, emissive: 0xffd9a0, emissiveIntensity: 0, envMapIntensity: .6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x5f7046, roughness: .7 }),
    lemon: new THREE.MeshStandardMaterial({ color: 0xe9c24a, roughness: .45 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfffaf0).multiplyScalar(2.2) }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: .5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: .8 }),
  };

  const stoneMats = [];
  const stoneMat = f => { const m = createStoneMaterial({ roughness: .12, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.15 }); m.userData.fit = f; stoneMats.push(m); return m; };

  const room = new THREE.Group(); scene.add(room);
  const add = (geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.ry) m.rotation.y = o.ry;
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    m.castShadow = o.cast ?? true; m.receiveShadow = o.recv ?? true;
    (o.parent || room).add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const rbox = (w, h, d, r = .008) => new RoundedBoxGeometry(w, h, d, 2, r);

  // ---------------- oda ----------------
  const RW = 6.4, BACK = -1.85, FRONT = 5.5;
  add(new THREE.PlaneGeometry(RW, FRONT - BACK), M.floor, 0, 0, (BACK + FRONT) / 2, { rx: -Math.PI / 2, cast: false });
  add(new THREE.PlaneGeometry(RW, 4.2), M.wall, 0, 2.1, BACK, { cast: false });                       // arka duvar
  const sideWall = (x, ry) => add(new THREE.PlaneGeometry(FRONT - BACK, 4.2), M.wall, x, 2.1, (BACK + FRONT) / 2, { ry, cast: false });
  sideWall(-RW / 2, Math.PI / 2); sideWall(RW / 2, -Math.PI / 2);
  // sol duvarda boy penceresi (gün ışığının kaynağı)
  const win = new THREE.Group(); win.position.set(-RW / 2 + .01, 0, -.35); win.rotation.y = Math.PI / 2; room.add(win);
  add(new THREE.PlaneGeometry(1.9, 2.5), M.windowGlow, 0, 1.55, 0, { parent: win, cast: false, recv: false });
  [[-.95, .04], [.95, .04], [0, .025]].forEach(([x, w]) => add(box(w, 2.56, .05), M.frame, x, 1.55, .02, { parent: win, cast: false }));
  [[.3, .05], [2.8, .05], [1.55, .025]].forEach(([y, h]) => add(box(1.94, h, .05), M.frame, 0, y, .02, { parent: win, cast: false }));

  // ---------------- arka tezgah: boy dolaplar + taş arka panel ----------------
  const BW = 3.4, BD = .62, BH = .87, BT = .04, SPL = 2.22;   // arka tezgah genişlik/derinlik/yükseklik, panel üst kotu
  const bz = BACK + BD / 2;
  // alt dolaplar (krem lake, ince pirinç tutamak)
  add(box(BW, BH - .1, BD - .02), M.lacquer, 0, (BH - .1) / 2 + .1, bz - .01);
  add(box(BW, .1, BD - .08), M.dark, 0, .05, bz - .04, { cast: false });
  for (let k = 0; k < 4; k++) {
    const x = -BW / 2 + BW / 8 + k * BW / 4;
    add(box(BW / 4 - .012, BH - .14, .004), M.lacquer, x, (BH - .1) / 2 + .1, bz + BD / 2 - .01);
    add(box(.36, .012, .02), M.brass, x, BH - .1, bz + BD / 2 + .005, { cast: false });
  }
  // arka tezgah üstü ve arka panel (taş)
  const backTopMat = stoneMat({ w: BW, h: BD });
  const backEdge = stoneMat({ w: BW, h: BT, oy: .3 });
  add(rbox(BW + .02, BT, BD + .02, .006), [backEdge, backEdge, backTopMat, backEdge, backEdge, backEdge], 0, BH + BT / 2, bz);
  const splMat = stoneMat({ w: BW, h: SPL - BH - BT });
  add(box(BW, SPL - BH - BT, .02), splMat, 0, (SPL + BH + BT) / 2, BACK + .011, { cast: false });
  // panelin üstünde ışıklı pirinç raf çizgisi
  add(box(BW, .03, .2), M.brass, 0, SPL + .015, BACK + .1);
  // iki yanda boy dolaplar (iki kapak, dikey pirinç tutamak)
  [-1, 1].forEach(sg => {
    const x = sg * (BW / 2 + .62);
    add(box(1.22, 2.75, BD + .02), M.lacquer, x, 1.375, bz);
    [-.305, .305].forEach(dx => {
      add(box(.6, 2.7, .004), M.lacquer, x + dx, 1.375, bz + BD / 2 + .012);
      add(box(.014, .9, .02), M.brass, x + dx + (dx > 0 ? -.27 : .27), 1.25, bz + BD / 2 + .03, { cast: false });
    });
  });
  // musluk (pirinç), seramik vazoda yeşillik, panele yaslı ceviz kesme tahtası
  const tap = new THREE.Group(); tap.position.set(.45, BH + BT, bz - .12); room.add(tap);
  add(new THREE.CylinderGeometry(.025, .03, .36, 20), M.brass, 0, .18, 0, { parent: tap });
  const spout = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .36, 0), new THREE.Vector3(0, .5, .02), new THREE.Vector3(0, .42, .22)), 16, .014, 10);
  add(spout, M.brass, 0, 0, 0, { parent: tap });
  add(new THREE.CylinderGeometry(.09, .07, .24, 32), M.ceramic, -.9, BH + BT + .12, bz - .05);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    add(new THREE.SphereGeometry(.07 + (i % 3) * .015, 10, 8), M.leaf, -.9 + Math.cos(a) * .07, BH + BT + .32 + (i % 2) * .08, bz - .05 + Math.sin(a) * .07);
  }
  add(rbox(.32, .46, .025, .01), M.walnut, -.35, BH + BT + .23, BACK + .06, { rx: -.12 });

  // ---------------- ada (waterfall) ----------------
  const W = 2.6, D = 1.0, H = .92, T = .06;
  const island = new THREE.Group(); island.position.set(0, 0, .35); room.add(island);
  const topMat = stoneMat({ w: W, h: D });
  const edgeMat = stoneMat({ w: W, h: T, oy: .2 });
  add(rbox(W, T, D, .01), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat], 0, H - T / 2, 0, { parent: island });
  const sideMatL = stoneMat({ w: D, h: H - T, ox: .1 }), sideMatR = stoneMat({ w: D, h: H - T, ox: .45 });
  const sEdge = stoneMat({ w: T, h: H - T });
  add(rbox(T, H - T, D, .01), [sideMatR, sideMatR, sEdge, sEdge, sEdge, sEdge], W / 2 - T / 2, (H - T) / 2, 0, { parent: island });
  add(rbox(T, H - T, D, .01), [sideMatL, sideMatL, sEdge, sEdge, sEdge, sEdge], -W / 2 + T / 2, (H - T) / 2, 0, { parent: island });
  // ceviz gövde arka (çalışma) tarafta; ön tarafta oturma boşluğu
  add(box(W - 2 * T - .02, H - T - .1, .6), M.walnut, 0, (H - T - .1) / 2 + .1, -.18, { parent: island });
  add(box(W - 2 * T - .02, .1, .5), M.dark, 0, .05, -.2, { parent: island, cast: false });
  add(box(W - 2 * T - .02, .02, .02), M.brass, 0, H - T - .12, .125, { parent: island, cast: false });
  // ada üstünde limon dolu seramik kase
  add(new THREE.SphereGeometry(.17, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.ceramic, .62, H + .14, -.05, { parent: island });
  [[.58, .02, 0], [.68, -.08, 0], [.64, -.02, .06], [.55, -.1, 0]].forEach(([x, z, dy]) => add(new THREE.SphereGeometry(.05, 16, 12), M.lemon, x, H + .05 + dy, z - .02, { parent: island }));

  // tabureler (ön tarafta, tezgahın altına itilmiş)
  const stool = x => {
    const g = new THREE.Group(); g.position.set(x, 0, .32); island.add(g);
    add(new THREE.CylinderGeometry(.19, .18, .06, 32), M.leather, 0, .68, 0, { parent: g });
    add(rbox(.34, .16, .03, .012), M.leather, 0, .82, -.17, { parent: g, rx: .08 });
    [[-.13, -.13], [.13, -.13], [-.13, .13], [.13, .13]].forEach(([lx, lz]) => {
      const leg = add(new THREE.CylinderGeometry(.012, .014, .68, 10), M.brass, lx * .92, .34, lz * .92, { parent: g });
      leg.rotation.z = lx * -.08; leg.rotation.x = lz * .08;
    });
    add(new THREE.TorusGeometry(.13, .007, 6, 32), M.brass, 0, .24, 0, { parent: g, rx: Math.PI / 2 });
    return g;
  };
  [-.78, 0, .78].forEach(stool);

  // ---------------- sarkıt lambalar ----------------
  const glowTex = createGlowTexture({ size: 128, color: '#ffd9a0' });
  const bulbs = [];
  [-.72, .72].forEach(x => {
    const g = new THREE.Group(); g.position.set(x, 0, .35); room.add(g);
    add(new THREE.CylinderGeometry(.003, .003, 2.1, 6), M.dark, 0, 3.15, 0, { parent: g, cast: false });
    add(new THREE.CylinderGeometry(.035, .035, .05, 16), M.brass, 0, 2.08, 0, { parent: g, cast: false });
    add(new THREE.SphereGeometry(.18, 32, 24), M.shade, 0, 1.92, 0, { parent: g, cast: false, recv: false });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(.9); glow.position.y = 1.92; g.add(glow);
    const pl = new THREE.PointLight(0xffd29a, 0, 3.4, 2); pl.position.y = 1.86; g.add(pl);
    bulbs.push({ glow, pl });
  });

  // ---------------- LED aydınlatma (akşam modu) ----------------
  // sıcak LED şeritler + zemine düşen ışık havuzları + ışıkta içten parlayan taş (arkadan aydınlatmalı mermer)
  const LED = new THREE.Color(0xffc985);
  const leds = [];
  const ledStrip = (w, h, d, x, y, z, parent = room) => {
    const m = new THREE.Mesh(box(w, h, d), new THREE.MeshBasicMaterial({ color: LED.clone().multiplyScalar(0), toneMapped: false }));
    m.position.set(x, y, z); parent.add(m); leds.push(m); return m;
  };
  ledStrip(W - .14, .006, .012, 0, H - T - .006, .47, island);          // ada ön çıkıntısının altı
  ledStrip(W - 2 * T - .04, .008, .01, 0, .012, .125, island);           // ada süpürgelik
  ledStrip(BW - .04, .008, .01, 0, .012, bz + BD / 2 - .035);            // arka dolap süpürgelik
  const shelfLed = ledStrip(BW - .1, .008, .02, 0, SPL - .006, BACK + .17);   // raf altı (gündüz de ince ışık çizgisi)
  const SHELF_DAY = new THREE.Color(0xffe2b0).multiplyScalar(.85);
  [-1, 1].forEach(sg => ledStrip(.006, 2.6, .01, sg * (BW / 2 + .005), 1.4, bz + BD / 2 - .005));  // boy dolap kenarları
  const pools = [];
  const poolTex = createGlowTexture({ size: 128, color: '#ffc985' });
  const pool = (w, d, x, y, z, rx = -Math.PI / 2, parent = room) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.rotation.x = rx; m.position.set(x, y, z); m.renderOrder = 2; parent.add(m); pools.push(m); return m;
  };
  pool(W + .3, .9, 0, .004, .55, -Math.PI / 2, island);                 // ada önünde zemin
  pool(BW + .2, .8, 0, .004, bz + .55);                                 // arka dolap önünde zemin
  pool(BW, .7, 0, BH + BT + .32, BACK + .025, 0);                        // arka panel üzerinde yıkama ışığı
  const ledLights = [new THREE.PointLight(0xffc985, 0, 1.8, 2), new THREE.PointLight(0xffc985, 0, 2.6, 2)];
  ledLights[0].position.set(0, .12, .35 + .72); ledLights[1].position.set(0, SPL - .1, BACK + .35);
  room.add(...ledLights);
  // taşın içten parlama miktarı: arka panel tam, ada yanları orta, yüzeyler hafif
  splMat.userData.glow = 1; sideMatL.userData.glow = sideMatR.userData.glow = .55; sEdge.userData.glow = .5;
  edgeMat.userData.glow = .35; backEdge.userData.glow = .3;
  // ---------------- ŞAHİN MERMER tabelası: arkadan LED hâleli, neon çerçeveli ----------------
  // Harfler duvardan 4,5 cm önde; arkalarından duvara sıcak LED ışığı taşar, çevrelerinde neon tüp yanar.
  // LED'ler açılırken neon gerçek tabela gibi titreyerek yanar; harflerin üzerinden ara ara ışık geçer.
  const SIGN_W = 1.72, SIGN_H = SIGN_W * 548 / 1024;
  const sign = new THREE.Group(); sign.position.set(0, SPL + .4, BACK); room.add(sign);
  const sweepU = { value: -1 };
  const signM = {};
  const texP = u => new Promise(r => loader.load(u, r, undefined, () => r(null)));
  Promise.all(['assets/logo-3d.png', 'assets/logo-halo.png', 'assets/logo-neon.png'].map(texP)).then(([lt, ht, nt]) => {
    if (!lt || !ht || !nt) return;
    lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = maxAniso;
    const geo = new THREE.PlaneGeometry(SIGN_W, SIGN_H);
    const plane = (mat, z, sx = 1) => { const m = new THREE.Mesh(geo, mat); m.position.z = z; m.scale.setScalar(sx); sign.add(m); return m; };
    signM.shadow = plane(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: ht, transparent: true, opacity: .14, depthWrite: false, toneMapped: false }), .004);
    signM.shadow.position.set(.012, -.028, .004);
    signM.halo = plane(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(1.3), alphaMap: ht, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), .007, 1.08);
    signM.neon = plane(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(1.25), alphaMap: nt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), .03);
    const lm = new THREE.MeshStandardMaterial({ map: lt, transparent: true, alphaTest: .3, roughness: .32, metalness: .3, envMapIntensity: .9 });
    lm.onBeforeCompile = sh => {
      sh.uniforms.uSweep = sweepU;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', () => '#include <common>\nuniform float uSweep;')
        .replace('#include <emissivemap_fragment>', () => `#include <emissivemap_fragment>
        #ifdef USE_MAP
        { float g = exp( -pow( ( vMapUv.x + vMapUv.y * .35 - uSweep ) * 14.0, 2.0 ) ); totalEmissiveRadiance += vec3( 1.0, .82, .55 ) * g * 1.3 * diffuseColor.a; }
        #endif`);
    };
    lm.customProgramCacheKey = () => 'signSweep1';
    signM.letters = plane(lm, .045);
    envBase.set(lm, lm.envMapIntensity);
  });
  // neon yanma titremesi: (zaman, parlaklık) adımları, sonra sürekli yanık
  const FLICK = [[0, 0], [.06, 1], [.11, 0], [.24, 0], [.28, .9], [.33, .15], [.47, 1], [.52, .35], [.6, 1], [.9, .7], [.95, 1]];
  const flicker = s => { if (s >= 1) return 1; let v = 0; for (const [k, b] of FLICK) if (s >= k) v = b; return v; };
  let neonOn = false, neonT0 = 0;

  const envBase = new Map();
  scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; ms.forEach(m => { if ('envMapIntensity' in m && !envBase.has(m)) envBase.set(m, m.envMapIntensity); }); });
  const winDay = M.windowGlow.color.clone(), winNight = new THREE.Color(0x3a4f7a).multiplyScalar(.55);
  let night = 0, nightT = 0, userToggled = false;

  // ---------------- temas gölgeleri (yumuşak koyuluk) ----------------
  const shadowPlane = (w, d, x, z, op) => {
    const t = createContactShadowTexture({ size: 256, softness: .55, opacity: 1, aspect: w / d });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .003, z); m.renderOrder = 1; room.add(m); return m;
  };
  shadowPlane(W + .5, D + .45, 0, .35, .5);
  shadowPlane(BW + 2.8, BD + .4, 0, bz + .1, .4);
  [-.78, 0, .78].forEach(x => shadowPlane(.55, .55, x, .67, .32));

  // ---------------- taş giydirme ----------------
  let curIdx = 0, dressTok = 0, shownMaps = [];
  async function dress(i, animate) {
    const tok = ++dressTok;
    const base = await tex(stones[i]); if (!base || tok !== dressTok) return false;
    const prev = shownMaps;
    const next = stoneMats.map(m => fit(base, m.userData.fit));
    shownMaps = next;
    const drop = () => prev.forEach(t => { if (!stoneMats.some(m => m.map === t)) t.dispose(); });
    if (!animate) { stoneMats.forEach((m, k) => setStoneMap(m, next[k])); drop(); return true; }
    renderer.initTexture(next[0]);   // GPU'ya önceden yükle: geçiş ilk karede takılmasın
    // ışıklı çizgi arka panelin sol arka köşesinden adanın sağ ön köşesine kadar ilerler
    await wipeStones(stoneMats.map((m, k) => ({ material: m, next: next[k] })), { duration: 1.25, from: -2.45, to: 1.75 });
    drop();
    return true;
  }
  await dress(0, false);
  // diğer taşları açılış bittikten sonra arkadan yükle (ilk görüntüyle yarışmasın)
  setTimeout(() => stones.slice(1).forEach(tex), 4500);

  // ---------------- etkileşim ----------------
  let yaw = 0, yawT = 0, vel = 0, gyroY = 0, gyroYT = 0, gyroP = 0, gyroPT = 0, active = true, onDrag = null;
  const YL = .62;                                   // gezinme sınırı (± radyan)
  // kamera hiçbir durumda yan duvarların dışına çıkmasın (eğim + nefes + fare dahil)
  const AM = Math.asin(Math.min(1, 3.05 / (REST.r * Math.cos(REST.pitch + .07))));
  const hero$ = document.querySelector('.hero');
  const inZone = (x, y, el) => !(el && el.closest && el.closest('a,button,.h3d__pick,.h3d__toast')) && (mobile ? y < ch * K * .85 : x > cw * .38);
  let lx = null, lt = 0;
  const start = (x, y, el) => { if (inZone(x, y, el)) { lx = x; lt = performance.now(); vel = 0; } };
  const move = x => {
    if (lx === null) return;
    const now = performance.now(), dx = x - lx;
    const d = -dx * (mobile ? .0065 : .0042);
    // sınırın dışına çekince lastik gibi zorlaşır
    const over = Math.max(0, Math.abs(yawT) - YL);
    yawT += d * (over > 0 && Math.sign(d) === Math.sign(yawT) ? 1 / (1 + over * 8) : 1);
    yawT = clamp(yawT, -YL - .18, YL + .18);
    vel = d / Math.max(8, now - lt) * 16;
    lx = x; lt = now; onDrag && onDrag();
  };
  // parmak bir süre durup kaldırılırsa eski hız kullanılmasın
  const end = () => { if (lx !== null && performance.now() - lt > 80) vel = 0; lx = null; };
  hero$.addEventListener('touchstart', e => { const t = e.touches[0]; start(t.clientX, t.clientY, e.target); }, { passive: true });
  // iPhone eğim izni yalnızca gerçek dokunuş (touchend/click) içinde istenebilir
  hero$.addEventListener('touchend', () => askGyro(), { passive: true });
  hero$.addEventListener('click', () => askGyro());
  hero$.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true });
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  hero$.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && e.button === 0) start(e.clientX, e.clientY, e.target); });
  addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; if (lx !== null && !(e.buttons & 1)) { end(); return; } move(e.clientX); });
  addEventListener('pointerup', end); addEventListener('pointercancel', end); addEventListener('blur', end);
  let mx = 0, my = 0;
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; } });

  // telefon eğimi (iOS ilk dokunuşta izin ister)
  let base0 = null, gyroOn = false;
  function onOri(e) {
    if (e.gamma == null || e.beta == null) return;
    if (!base0) base0 = { g: e.gamma, b: e.beta };
    gyroYT = clamp((e.gamma - base0.g) / 30, -1, 1) * -.22;
    gyroPT = clamp((e.beta - base0.b) / 30, -1, 1) * .07;
    gyroOn = true;
  }
  function askGyro() {
    const DO = window.DeviceOrientationEvent;
    if (gyroOn || askGyro.done || askGyro.busy || !DO || typeof DO.requestPermission !== 'function') return;
    askGyro.busy = true;
    // izin kesin yanıtlanınca bir daha sorma; hata olursa sonraki dokunuşta tekrar dene
    DO.requestPermission().then(s => { askGyro.done = true; if (s === 'granted') addEventListener('deviceorientation', onOri); })
      .catch(() => {}).finally(() => { askGyro.busy = false; });
  }
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') addEventListener('deviceorientation', onOri);

  // ---------------- açılış sinematiği ----------------
  // kamera cilalı ada yüzeyine çok yakından başlar, sonra geri çekilip mutfağı gösterir
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // test anahtarları (müşteri görmez): ?nointro açılışı atlar, ?night LED'ler açık başlar
  const qs = location.search;
  let intro = reduced || /[?&]nointro/.test(qs) ? 1 : 0;
  const INTRO_S = 3.6;
  const macroPos = new THREE.Vector3(.95, H + .2, .35 + .62);
  const macroLook = new THREE.Vector3(.1, H, .2);
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), restPos = new THREE.Vector3();
  let autoLit = reduced || /[?&]nointro/.test(qs), onLights = null, afterIntro = 0;
  if (/[?&]night/.test(qs)) { nightT = night = 1; autoLit = true; }

  camera.position.copy(intro < 1 ? macroPos : restPos.set(0, TARGET.y + Math.sin(REST.pitch) * REST.r, TARGET.z + Math.cos(REST.pitch) * REST.r));
  camera.lookAt(intro < 1 ? macroLook : TARGET);
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* derleme ilk karede yapılır */ }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); });
  canvas.addEventListener('webglcontextrestored', () => { scene.environment = createStudioEnvironment(renderer, { intensity: 1 }); });

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (!active) return;
    const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
    if (intro < 1) intro = Math.min(1, intro + dt / INTRO_S);
    const ip = easeIO(intro);

    // sürükleme ataleti + sınırda yay gibi geri dönüş
    if (lx === null) {
      yawT += vel; vel *= .92;
      if (Math.abs(yawT) > YL) { yawT += (Math.sign(yawT) * YL - yawT) * .12; vel *= .6; }
    }
    yaw += (yawT - yaw) * .12;
    gyroY += (gyroYT - gyroY) * .07; gyroP += (gyroPT - gyroP) * .07;
    const breathe = Math.sin(t * .23) * .025;            // durgun değil, hafif nefes alan sahne

    const a = clamp(yaw + gyroY + breathe + mx * .25, -AM, AM);
    const p = REST.pitch + gyroP + my * -.06;
    restPos.set(TARGET.x + Math.sin(a) * Math.cos(p) * REST.r, TARGET.y + Math.sin(p) * REST.r, TARGET.z + Math.cos(a) * Math.cos(p) * REST.r);
    camPos.lerpVectors(macroPos, restPos, ip);
    look.lerpVectors(macroLook, TARGET, ip);
    camera.position.copy(camPos);
    camera.lookAt(look);

    // açılış bittikten kısa süre sonra LED'ler bir kez kendiliğinden yanar (kullanıcı dokunmadıysa)
    if (intro >= 1) afterIntro += dt;
    if (!userToggled && !autoLit && afterIntro > 1.4) { autoLit = true; nightT = 1; onLights && onLights(true); }
    night += (nightT - night) * Math.min(1, dt * 2.4);
    const n = night, ns = n * n * (3 - 2 * n);

    // lambalar açılışta yavaşça yanar; akşamda daha parlak
    const lampOn = clamp((intro - .25) / .5, 0, 1);
    bulbs.forEach(({ glow, pl }, k) => {
      const fl = 1 + Math.sin(t * 3 + k) * .015;
      glow.material.opacity = (.5 + .45 * ns) * lampOn * fl; pl.intensity = (1.1 + 1.6 * ns) * lampOn * fl;
    });
    M.shade.emissiveIntensity = (1.4 + 1.2 * ns) * lampOn;
    // gündüz → akşam: güneş ve ortam ışığı azalır, pencere lacivertleşir, LED'ler yanar, taş içten parlar
    sun.intensity = lerp(2.6, .1, ns);
    hemi.intensity = lerp(.35, .03, ns);
    const envK = lerp(1, .17, ns);
    envBase.forEach((v, m) => { m.envMapIntensity = v * envK; });
    M.windowGlow.color.lerpColors(winDay, winNight, ns);
    const ledK = 2.4 * ns * (1 + Math.sin(t * 2.1) * .01);
    leds.forEach(m => m.material.color.copy(LED).multiplyScalar(ledK));
    shelfLed.material.color.lerpColors(SHELF_DAY, shelfLed.material.color, ns);
    pools.forEach((m, k) => { m.material.opacity = (k === 2 ? .55 : .75) * ns; });
    ledLights[0].intensity = 1.3 * ns; ledLights[1].intensity = 1.6 * ns;
    // tabela: neon titreyerek yanar, sonra hafifçe nefes alır; gündüz sadece ince hâle + duvara gölge
    if (nightT > .5 && !neonOn) { neonOn = true; neonT0 = t; }
    if (nightT < .5) neonOn = false;
    const fk = neonOn ? flicker((t - neonT0) / 1.5) : 0;
    const breath = 1 + Math.sin(t * 2.1) * .06 + Math.sin(t * 37) * Math.sin(t * 11) * .025;
    if (signM.neon) {
      const on = Math.min(ns * 1.4, 1) * fk * breath;
      signM.neon.material.opacity = .95 * on;
      signM.halo.material.opacity = .14 * (1 - ns) + .9 * on;
      signM.shadow.material.opacity = .14 * (1 - ns);
    }
    sweepU.value = ((t % 6) / 6) * 2.4 - .5;
    stoneMats.forEach(m => { const u = m.userData.u; if (u && u.uGlow) u.uGlow.value = (m.userData.glow || .08) * ns; });
    renderer.toneMappingExposure = lerp(.82, 1.0, ip) * lerp(1, 1.12, ns);

    renderer.setViewport(0, ch * (1 - K), cw, ch * K);
    renderer.render(scene, camera);
  }
  loop();

  addEventListener('resize', size);

  return {
    setProgress() {},
    setLabels() {},
    setActive(v) { if (v && !active) { vel = 0; clock.getDelta(); } active = v; },
    nudge(dy) { if (active) vel += clamp(dy * -.00035, -.012, .012); },
    onDrag(fn) { onDrag = fn; },
    // LED ışıkları: açık/kapalı (aç-kapa animasyonlu). Dönen değer: yeni durum
    setLights(on) { userToggled = true; nightT = on ? 1 : 0; return !!on; },
    lightsOn() { return nightT > .5; },
    onLights(fn) { onLights = fn; },
    async setStone(url) {
      let i = stones.indexOf(url);
      if (i < 0) { stones.push(url); i = stones.length - 1; }
      if (i === curIdx) return true;
      const prev = curIdx; curIdx = i;
      const ok = await dress(i, !reduced);
      if (!ok && curIdx === i) curIdx = prev;
      return ok;
    },
  };
}
