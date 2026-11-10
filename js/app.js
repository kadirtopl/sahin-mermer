import { PHONE, OWNER, PRIZES, SPIN_PLAN, PRIZE_HOURS, LINES, FAMS, RING, CAT_ICON } from './data.js';
import { STONES as RAW, CATS } from './catalog.js';

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
scrollTo(0, 0);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('smg_' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('smg_' + k, JSON.stringify(v)); } catch {} },
};
const isTouch = matchMedia('(hover: none)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- data ---------------- */
const tasUrl = (id, k) => `assets/cat/tas/${id}-${k}.webp`;
const STONES = RAW.map(s => ({ ...s, sw: tasUrl(s.id, 'sw'), tx: tasUrl(s.id, 'tx'), slab: tasUrl(s.id, 'slab') }));
const stoneById = id => STONES.find(s => s.id === id);
const catById = id => CATS.find(c => c.id === id);
const lineName = s => LINES[s.line].name;
const famName = id => (FAMS.find(f => f.id === id) || {}).name || '';
const img = (src, t) => `${src}${t ? '-t' : ''}.webp`;

const state = { line: 'm', fam: null, stone: null, cat: null };
const saved = store.get('sel');
if (saved) Object.assign(state, { stone: saved.stone || null, cat: saved.cat || null });

/* ---------------- WhatsApp ---------------- */
function waLink(text) { return `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`; }
function track(ev, data) { try { window.fbq && fbq('track', ev, data); } catch {} }
$$('[data-wa]').forEach(a => {
  a.target = '_blank'; a.rel = 'noopener';
  a.addEventListener('click', () => { a.href = waLink(waMessage(store.get('win')?.prize)); track('Contact'); });
  a.href = waLink(a.dataset.wa);
});

/* ---------------- smooth scroll ---------------- */
let lenis = null;
if (window.Lenis && !reduced) {
  lenis = new Lenis({ duration: 1.25, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
function lockScroll(on) {
  document.body.classList.toggle('lock', on);
  if (lenis) on ? lenis.stop() : lenis.start();
}
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  if (id.length < 2) return;
  const el = $(id); if (!el) return;
  e.preventDefault();
  lenis ? lenis.scrollTo(el, { offset: -60 }) : el.scrollIntoView({ behavior: 'smooth' });
}));

/* ---------------- nav ---------------- */
const nav = $('#nav');
let lastY = 0;
function onNav(y) {
  nav.classList.toggle('is-solid', y > 40);
  nav.classList.toggle('is-hidden', y > 600 && y > lastY + 2);
  if (y < lastY - 2) nav.classList.remove('is-hidden');
  lastY = y;
}

/* ---------------- reveal ---------------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
$$('.reveal').forEach(el => io.observe(el));

/* ---------------- autoplay videos ---------------- */
const vio = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => {}); }
  else v.pause();
}), { threshold: .35 });
$$('video.autoplay').forEach(v => vio.observe(v));

/* ---------------- scroll loop ---------------- */
let scene = null;
function onScroll() {
  const y = window.scrollY;
  onNav(y);
  if (scene) {
    // açılış sabit kalır: kaydırma boyunca halka tam tur döner, son %22'de taşlar aşağı iner
    const heroH = $('.hero').offsetHeight, vh = innerHeight, run = Math.max(1, heroH - vh);
    const p = Math.min(1, Math.max(0, y / run));
    const after = Math.max(0, (y - run) / vh);
    const s = p < .78 ? 0 : (p - .78) / .22 + Math.min(1, after);
    scene.setProgress(Math.min(2, s), p);
    $('.hero__pin').style.setProperty('--drop', Math.min(1, Math.max(0, (p - .74) / .2)).toFixed(3));
    const visible = y < heroH + vh * .3;
    $('#stage').style.opacity = visible ? 1 : 0;
    scene.setActive(visible);
  }
}
lenis ? lenis.on('scroll', onScroll) : addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);

/* ---------------- cursor + magnetic ---------------- */
if (!isTouch) {
  const cur = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`; });
  (function loop() { rx += (mx - rx) * .16; ry += (my - ry) * .16; ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`; requestAnimationFrame(loop); })();
  document.addEventListener('pointerover', e => cur.classList.toggle('is-hover', !!e.target.closest('a,button,.sw,.job,.dot,.chip')));
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

/* ================= TAŞ KATALOĞU ================= */
const linesEl = $('#lines'), famsEl = $('#fams'), swEl = $('#swatches');
const sio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); sio.unobserve(e.target); } }), { threshold: .05 });
function renderLines() {
  linesEl.innerHTML = Object.entries(LINES).map(([k, l]) => {
    const n = STONES.filter(s => s.line === k).length;
    return `<button class="ser ${k === state.line ? 'is-on' : ''}" role="tab" aria-selected="${k === state.line}" data-line="${k}"><b>${l.name}</b><small>${n} renk</small></button>`;
  }).join('');
  $('#lineDesc').textContent = LINES[state.line].desc;
  const have = new Set(STONES.filter(s => s.line === state.line).map(s => s.fam));
  famsEl.innerHTML = `<button class="fam ${!state.fam ? 'is-on' : ''}" data-fam="">Tümü</button>` +
    FAMS.filter(f => have.has(f.id)).map(f => `<button class="fam ${state.fam === f.id ? 'is-on' : ''}" data-fam="${f.id}"><i style="background:${f.dot}"></i>${f.name}</button>`).join('');
}
function renderSwatches() {
  const list = STONES.filter(s => s.line === state.line && (!state.fam || s.fam === state.fam));
  swEl.innerHTML = list.map((s, i) => `<button class="sw ${state.stone === s.id ? 'is-sel' : ''}" data-stone="${s.id}" style="transition-delay:${Math.min(i, 12) * 35}ms">
      <span class="sw__img"><img src="${s.sw}" alt="${esc(s.name)}" loading="lazy" decoding="async"></span>
      <span class="sw__name">${esc(s.name)}</span>
      <span class="sw__meta">${s.code ? s.code + ' · ' : ''}${s.imgs.length ? s.imgs.length + ' uygulama' : famName(s.fam)}</span>
    </button>`).join('');
  $$('.sw', swEl).forEach(t => sio.observe(t));
}
linesEl.addEventListener('click', e => { const b = e.target.closest('[data-line]'); if (!b) return; state.line = b.dataset.line; state.fam = null; renderLines(); renderSwatches(); });
famsEl.addEventListener('click', e => { const b = e.target.closest('[data-fam]'); if (!b) return; state.fam = b.dataset.fam || null; renderLines(); renderSwatches(); });
swEl.addEventListener('click', e => { const t = e.target.closest('[data-stone]'); if (t) openStone(t.dataset.stone); });

function select(stone) {
  state.stone = stone;
  store.set('sel', { stone, cat: state.cat });
  $$('.sw', swEl).forEach(t => t.classList.toggle('is-sel', t.dataset.stone === stone));
  updateSel();
  const s = stoneById(stone);
  scene && s && scene.setStone(s.tx);
}
function updateSel() {
  const s = stoneById(state.stone);
  document.body.classList.toggle('has-sel', !!s);
  if (!s) return;
  $('#selSw').style.backgroundImage = `url(${s.sw})`;
  $('#selTxt').textContent = `${s.name} · ${LINES[s.line].short}`;
}

/* ================= YAPILAN İŞLER ================= */
function renderJobs() {
  $('#jobgrid').innerHTML = CATS.map((c, i) => {
    const cover = c.imgs[0];
    const stones = [...new Set(c.imgs.map(x => x.stone))].map(stoneById).filter(Boolean);
    return `<button class="job reveal" data-cat="${c.id}" style="transition-delay:${(i % 4) * 70}ms">
      <span class="job__img">${cover ? `<img src="${img(cover.src, 1)}" alt="${esc(c.name)}" loading="lazy" decoding="async">` : ''}</span>
      <span class="job__cap"><b>${esc(c.name)}</b><small>${c.imgs.length} görsel · ${stones.length} renk</small></span>
      <span class="job__dots">${stones.slice(0, 6).map(s => `<i style="background-image:url(${s.sw})"></i>`).join('')}${stones.length > 6 ? `<em>+${stones.length - 6}</em>` : ''}</span>
      <span class="job__go">→</span>
    </button>`;
  }).join('');
  $$('.job').forEach(el => io.observe(el));
}
$('#jobgrid').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) openCat(b.dataset.cat); });

/* ================= VIEWER (taş / kategori) ================= */
const viewer = $('#viewer'), vTrack = $('#tvTrack');
let vIdx = 0, vList = [], vMode = null;
function openViewerShell() {
  if (viewer.hidden) {
    viewer.hidden = false; document.body.classList.add('tv-open'); lockScroll(true);
    history.pushState({ tv: 1 }, '');
  }
}
// slide: {src, full, stone, label, ai}
function fillSlides(list, start = 0) {
  vList = list;
  vTrack.innerHTML = list.map((x, i) => `<div class="tv__slide${x.slab ? ' tv__slide--slab' : ''}"><img ${i < 2 ? '' : 'loading="lazy"'} decoding="async" src="${x.full}" alt="${esc(x.label)}" draggable="false"></div>`).join('');
  goSlide(start, true);
}
function openStone(id, start = 0) {
  const s = stoneById(id); if (!s) return;
  vMode = 'stone'; select(id);
  openViewerShell();
  $('#tvTitle').textContent = s.name;
  $('#tvSub').textContent = `${lineName(s)}${s.code ? ' · ' + s.code : ''} · ${famName(s.fam)}`;
  $('#tvDesc').textContent = s.imgs.length
    ? `${LINES[s.line].desc} Kaydırarak plakayı ve uygulandığı ${s.imgs.length} mekânı görün.`
    : `${LINES[s.line].desc} Bu rengin uygulama fotoğrafını WhatsApp’tan isteyebilirsiniz.`;
  const slides = [{ full: s.slab, stone: s.id, label: 'Plaka görünümü', slab: 1 },
    ...s.imgs.map(x => ({ full: img(x.src), stone: s.id, label: x.cat ? catById(x.cat).name : 'Uygulama', ai: x.ai }))];
  // alt şerit: aynı seri + aynı renk ailesinden taşlar
  const sib = STONES.filter(x => x.line === s.line && x.fam === s.fam);
  $('#tvThumbs').innerHTML = sib.map(x => `<button class="dot ${x.id === s.id ? 'is-on' : ''}" data-dot="${x.id}" style="background-image:url(${x.sw})" aria-label="${esc(x.name)}"><span>${esc(x.name)}</span></button>`).join('');
  fillSlides(slides, start);
  centerOn($(`.dot[data-dot="${s.id}"]`));
  track('ViewContent', { content_name: s.name });
}
function openCat(id) {
  const c = catById(id); if (!c) return;
  vMode = 'cat'; state.cat = id; store.set('sel', { stone: state.stone, cat: id });
  openViewerShell();
  $('#tvTitle').textContent = c.name;
  const n = new Set(c.imgs.map(x => x.stone)).size;
  $('#tvSub').textContent = c.imgs.length ? `${c.imgs.length} görsel · ${n} taş` : 'Yakında';
  $('#tvDesc').textContent = c.desc;
  const slides = c.imgs.map(x => { const s = stoneById(x.stone); return { full: img(x.src), stone: x.stone, label: s ? `${s.name} · ${LINES[s.line].short}` : '', ai: x.ai }; });
  $('#tvThumbs').innerHTML = slides.map((x, i) => { const s = stoneById(x.stone); return `<button class="dot dot--img" data-go="${i}" style="background-image:url(${s ? s.sw : ''})" aria-label="${esc(x.label)}"><span>${s ? esc(s.name) : ''}</span></button>`; }).join('');
  fillSlides(slides, 0);
  track('ViewContent', { content_name: c.name });
}
function centerOn(el) { el && el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
function goSlide(i, instant) {
  if (!vList.length) { $('#tvCount').textContent = ''; $('#tvTag').hidden = true; $$('.tv__nav').forEach(b => b.hidden = true); return updWa(); }
  vIdx = (i + vList.length) % vList.length;
  if (instant) { vTrack.style.transition = 'none'; requestAnimationFrame(() => vTrack.style.transition = ''); }
  vTrack.style.transform = `translate3d(${-vIdx * 100}%,0,0)`;
  $('#tvCount').textContent = vList.length > 1 ? `${vIdx + 1} / ${vList.length}` : '';
  $$('.tv__nav').forEach(b => b.hidden = vList.length < 2);
  const x = vList[vIdx], tag = $('#tvTag');
  tag.hidden = !x.label;
  tag.innerHTML = vMode === 'cat' && x.stone
    ? `<button data-tostone="${x.stone}">${esc(x.label)} <u>Bu taşı gör →</u></button>${x.ai ? '<i>✦ Yapay zekâ görselleştirme</i>' : ''}`
    : `<span>${esc(x.label)}</span>${x.ai ? '<i>✦ Yapay zekâ görselleştirme</i>' : ''}`;
  if (vMode === 'cat') {
    if (x.stone) { state.stone = x.stone; store.set('sel', { stone: x.stone, cat: state.cat }); updateSel(); }
    $$('#tvThumbs .dot').forEach((d, k) => d.classList.toggle('is-on', k === vIdx));
    centerOn($(`#tvThumbs .dot[data-go="${vIdx}"]`));
  }
  updWa();
}
function updWa() { $('#tvWa').href = waLink(waMessage(store.get('win')?.prize)); }
function closeViewer(fromPop) {
  if (viewer.hidden) return;
  viewer.hidden = true; document.body.classList.remove('tv-open'); lockScroll(false);
  if (!fromPop && history.state?.tv) history.back();
}
viewer.addEventListener('click', e => {
  if (e.target.closest('[data-vclose]')) return closeViewer();
  const n = e.target.closest('[data-vnav]'); if (n) return goSlide(vIdx + +n.dataset.vnav);
  const ts = e.target.closest('[data-tostone]'); if (ts) return openStone(ts.dataset.tostone, 0);
  const g = e.target.closest('[data-go]'); if (g) return goSlide(+g.dataset.go);
  const d = e.target.closest('[data-dot]');
  if (d) { $$('.tv__slide img', vTrack).forEach(i => i.classList.add('swap')); setTimeout(() => openStone(d.dataset.dot), 220); }
});
$('#tvWa').addEventListener('click', () => track('Contact', { content_name: state.stone }));
addEventListener('popstate', () => { closeViewer(true); closeWheel(true); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeWheel(); closeViewer(); }
  if (!viewer.hidden && e.key === 'ArrowRight') goSlide(vIdx + 1);
  if (!viewer.hidden && e.key === 'ArrowLeft') goSlide(vIdx - 1);
});
// swipe
let sx = null, sy = 0, sdx = 0, horiz = null;
const stage = $('#tvStage');
stage.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; sdx = 0; horiz = null; vTrack.style.transition = 'none'; });
stage.addEventListener('pointermove', e => {
  if (sx === null) return; sdx = e.clientX - sx;
  if (horiz === null && Math.abs(sdx) + Math.abs(e.clientY - sy) > 8) horiz = Math.abs(sdx) > Math.abs(e.clientY - sy);
  if (horiz) vTrack.style.transform = `translate3d(calc(${-vIdx * 100}% + ${sdx}px),0,0)`;
});
const endSwipe = () => { if (sx === null) return; vTrack.style.transition = ''; if (horiz && Math.abs(sdx) > 50) goSlide(vIdx + (sdx < 0 ? 1 : -1)); else goSlide(vIdx); sx = null; };
stage.addEventListener('pointerup', endSwipe); stage.addEventListener('pointercancel', endSwipe); stage.addEventListener('pointerleave', endSwipe);

/* ================= WHEEL ================= */
const wm = $('#wheelModal'), wc = $('#wheelCanvas'), spinBtn = $('#spinBtn');
const steps = n => $$('.wm__step', wm).forEach(s => s.hidden = s.dataset.step !== n);

function drawWheel() {
  const ctx = wc.getContext('2d'), W = wc.width, R = W / 2, n = PRIZES.length, a = Math.PI * 2 / n;
  ctx.clearRect(0, 0, W, W);
  PRIZES.forEach((p, i) => {
    const st = -Math.PI / 2 + i * a - a / 2;
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R, st, st + a); ctx.closePath();
    const g = ctx.createRadialGradient(R, R, R * .2, R, R, R);
    g.addColorStop(0, shade(p.color, 18)); g.addColorStop(1, p.color);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(217,183,122,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(R, R); ctx.rotate(st + a / 2);
    const light = ['#f4f0e9', '#d9b77a', '#b8915a'].includes(p.color);
    ctx.fillStyle = light ? '#1a140b' : '#f4f0e9';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${p.short.length > 6 ? 30 : 46}px Manrope, sans-serif`;
    ctx.fillText(p.short, R - 34, 0);
    ctx.restore();
  });
  // studs
  for (let i = 0; i < n * 2; i++) { const t = i * Math.PI / n; ctx.beginPath(); ctx.arc(R + Math.cos(t) * (R - 12), R + Math.sin(t) * (R - 12), 5, 0, 7); ctx.fillStyle = i % 2 ? '#fff6dd' : '#d9b77a'; ctx.fill(); }
}
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const c = v => Math.max(0, Math.min(255, v + amt)); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
drawWheel();
document.fonts && document.fonts.ready.then(drawWheel);

function openWheel() {
  wm.hidden = false; lockScroll(true); history.pushState({ wm: 1 }, '');
  const won = store.get('win');
  if (won) return showWin(won, false);
  updLeft();
  steps('spin');
  track('InitiateCheckout');
}
function closeWheel(fromPop) {
  if (wm.hidden) return;
  wm.hidden = true; if (viewer.hidden) lockScroll(false);
  if (!fromPop && history.state?.wm) history.back();
}
document.addEventListener('click', e => { if (e.target.closest('[data-open-wheel]')) { e.preventDefault(); openWheel(); } });
$$('[data-close]', wm).forEach(b => b.addEventListener('click', () => closeWheel()));

// Telefon başına en fazla SPIN_PLAN.length çevirme. Sonuç telefona kaydedilir, tekrar açınca aynı indirim görünür.
let rot = 0, spinning = false;
const spinsUsed = () => store.get('spins') || 0;
function updLeft(msg) {
  const left = SPIN_PLAN.length - spinsUsed();
  $('#spinLeft').innerHTML = msg || (left > 1 ? `Toplam <b>${left}</b> çevirme hakkın var` : 'Son <b>1</b> hakkın kaldı!');
}
spinBtn.addEventListener('click', () => {
  if (spinning) return;
  const n = spinsUsed(); if (n >= SPIN_PLAN.length) return;
  spinning = true; spinBtn.disabled = true;
  const idx = Math.max(0, PRIZES.findIndex(p => p.label === SPIN_PLAN[n]));
  const seg = 360 / PRIZES.length;
  const jitter = (Math.random() - .5) * seg * .55;
  rot += 360 * 7 + (360 - ((rot % 360) + idx * seg + jitter) % 360);
  wc.style.transform = `rotate(${rot}deg)`;
  tick(6000);
  store.set('spins', n + 1);
  setTimeout(() => {
    spinning = false; spinBtn.disabled = false;
    const last = n + 1 >= SPIN_PLAN.length;
    const prize = PRIZES[idx].label;
    if (!last) { updLeft(`<b>${prize}</b> çıktı! Bir hakkın daha var, daha iyisi için tekrar çevir 👆`); return; }
    const won = { prize, at: Date.now() };
    store.set('win', won);
    showWin(won, true);
    track('Lead', { content_name: prize });
  }, 6200);
});
function tick(ms) { // haptic ticks on mobile
  if (!navigator.vibrate) return;
  const t0 = performance.now();
  let next = 0;
  (function f() { const p = (performance.now() - t0) / ms; if (p > 1) return; if (performance.now() > next) { navigator.vibrate(4); next = performance.now() + 40 + p * p * 400; } requestAnimationFrame(f); })();
}

let timerInt = null;
function waMessage(prize) {
  const s = stoneById(state.stone), c = state.cat && catById(state.cat);
  return [
    prize ? `Merhaba 👋 Şahin Mermer sitesinde çarkı çevirdim, *${prize}* kazandım 🎁` : 'Merhaba 👋 Şahin Mermer sitesinden yazıyorum.',
    s && `Beğendiğim taş: ${s.name} (${lineName(s)})`,
    c && `Yaptırmak istediğim: ${c.name}`,
    'Fiyat alabilir miyim?',
  ].filter(Boolean).join('\n');
}
function showWin(won, fresh) {
  steps('win');
  $('#winPrize').textContent = won.prize;
  const s = stoneById(state.stone);
  $('#wmPicked').innerHTML = s ? `<i style="background-image:url(${s.sw})"></i><span>Seçtiğin taş: <b>${s.name}</b> · ${lineName(s)}</span>` : '';
  const a = $('#winWa'); a.href = waLink(waMessage(won.prize));
  a.onclick = () => track('Contact', { content_name: won.prize });
  clearInterval(timerInt);
  const end = won.at + PRIZE_HOURS * 3600e3;
  const upd = () => { const d = Math.max(0, end - Date.now()); const h = Math.floor(d / 3600e3), m = Math.floor(d / 6e4) % 60, sec = Math.floor(d / 1e3) % 60; $('#winTimer').textContent = [h, m, sec].map(v => String(v).padStart(2, '0')).join(':'); };
  upd(); timerInt = setInterval(upd, 1000);
  if (fresh) confetti();
}
function confetti() {
  const cv = $('#confetti'), box = cv.parentElement.parentElement;
  cv.width = box.clientWidth * devicePixelRatio; cv.height = box.clientHeight * devicePixelRatio;
  const ctx = cv.getContext('2d'), cols = ['#d9b77a', '#f4f0e9', '#b8915a', '#fff6dd', '#8a6a3c'];
  const P = Array.from({ length: 160 }, () => ({ x: cv.width / 2, y: cv.height * .3, vx: (Math.random() - .5) * 26, vy: -Math.random() * 22 - 6, r: Math.random() * 8 + 4, c: cols[Math.random() * 5 | 0], a: Math.random() * 6, va: (Math.random() - .5) * .4 }));
  let f = 0;
  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    P.forEach(p => { p.vy += .55; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (++f < 200) requestAnimationFrame(loop); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ================= BOOT ================= */
$('#yr').textContent = new Date().getFullYear();
const st0 = stoneById(state.stone); if (st0) state.line = st0.line;
renderLines(); renderSwatches(); renderJobs(); updateSel();

const pct = $('#loaderPct');
let shown = 0;
const pInt = setInterval(() => { shown = Math.min(shown + 3 + Math.random() * 6, 92); pct.textContent = shown | 0; }, 80);
function done() {
  clearInterval(pInt); pct.textContent = 100;
  setTimeout(() => { $('#loader').classList.add('done'); document.documentElement.classList.add('ready'); document.body.classList.add('ready'); $$('.hero .reveal').forEach(el => el.classList.add('in')); }, 250);
}
const failSafe = setTimeout(done, 4500);

const ringStones = RING.map(stoneById).filter(Boolean);
import('./scene.js').then(async ({ createScene }) => {
  scene = await createScene($('#stage'), { stones: ringStones.map(s => s.tx), mobile: innerWidth < 720 });
  const lab = $('#ringLabels');
  lab.innerHTML = ringStones.map(s => `<span>${s.name}</span>`).join('');
  scene.setLabels($$('span', lab));
  clearTimeout(failSafe); done(); onScroll();
}).catch(err => { console.warn('3D devre dışı:', err); clearTimeout(failSafe); done(); $('#stage').style.background = `url(${ringStones[1].tx}) center/cover`; });

onScroll();
