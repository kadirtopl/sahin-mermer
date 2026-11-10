import { PHONE, OWNER, PRIZES, PRIZE_HOURS, STONES, CATS } from './data.js';

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
scrollTo(0, 0);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('smg_' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('smg_' + k, JSON.stringify(v)); } catch {} },
};
const stoneImg = (id, k) => `assets/stone/${id}${k ? '-k' : ''}.webp`;
const isTouch = matchMedia('(hover: none)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- state ---------------- */
const state = {
  cat: CATS[0].id,
  stone: null,
  mat: 'Kuvars (Çimstone / Belenco)',
  service: CATS[0].service,
  manifest: {},
};
const saved = store.get('sel');
if (saved) Object.assign(state, { cat: saved.cat || state.cat, stone: saved.stone || null, mat: saved.mat || state.mat });

function images(cat, stone) {
  const gen = state.manifest?.[cat]?.[stone];
  if (gen && gen.length) return { list: gen, ai: true };
  return { list: [stoneImg(stone)], ai: false };
}
const stoneById = id => STONES.find(s => s.id === id);
const catById = id => CATS.find(c => c.id === id);

/* ---------------- WhatsApp ---------------- */
function waLink(text) { return `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`; }
function track(ev, data) { try { window.fbq && fbq('track', ev, data); } catch {} }
$$('[data-wa]').forEach(a => {
  a.href = waLink(a.dataset.wa);
  a.target = '_blank'; a.rel = 'noopener';
  a.addEventListener('click', () => track('Contact'));
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
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
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
  document.addEventListener('pointerover', e => cur.classList.toggle('is-hover', !!e.target.closest('a,button,.theme,.tile,.dot,.chip')));
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

/* ================= PICKER ================= */
const catsEl = $('#cats'), themesEl = $('#themes');
function renderCats() {
  catsEl.innerHTML = CATS.map(c => `<button class="cat ${c.id === state.cat ? 'is-on' : ''}" role="tab" data-cat="${c.id}"><i>${c.icon}</i>${c.name}</button>`).join('');
}
function renderThemes() {
  const tio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); tio.unobserve(e.target); } }), { threshold: .1 });
  themesEl.innerHTML = STONES.map((s, i) => {
    const im = images(state.cat, s.id);
    return `<article class="theme ${state.stone === s.id ? 'is-sel' : ''}" data-stone="${s.id}" style="transition-delay:${(i % 4) * 60}ms" tabindex="0">
      <div class="theme__img"><img src="${im.list[0]}" alt="${s.name} ${catById(state.cat).name}" loading="lazy"></div>
      <span class="theme__sw" style="background-image:url(${stoneImg(s.id, 1)})"></span>
      ${im.ai ? '<span class="theme__ai">✦ AI önizleme</span>' : ''}
      <span class="theme__plus">+</span>
      <div class="theme__cap"><h3>${s.name}</h3><p>${s.tag}</p></div>
      <span class="theme__n">${im.list.length} görsel</span>
    </article>`;
  }).join('');
  $$('.theme', themesEl).forEach(t => tio.observe(t));
}
catsEl.addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  state.cat = b.dataset.cat; state.service = catById(state.cat).service;
  renderCats(); renderThemes(); updateSel();
});
themesEl.addEventListener('click', e => {
  const t = e.target.closest('[data-stone]'); if (!t) return;
  openViewer(t.dataset.stone);
});
themesEl.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('[data-stone]') && openViewer(e.target.dataset.stone); });

function select(stone) {
  state.stone = stone;
  store.set('sel', { cat: state.cat, stone, mat: state.mat });
  $$('.theme', themesEl).forEach(t => t.classList.toggle('is-sel', t.dataset.stone === stone));
  updateSel();
  scene && scene.setStone(stone);
}
function updateSel() {
  const s = stoneById(state.stone);
  document.body.classList.toggle('has-sel', !!s);
  if (!s) return;
  $('#selSw').style.backgroundImage = `url(${stoneImg(s.id, 1)})`;
  $('#selTxt').textContent = `${catById(state.cat).name} · ${s.name}`;
  store.set('sel', { cat: state.cat, stone: state.stone, mat: state.mat });
}

/* ================= VIEWER ================= */
const viewer = $('#viewer'), vTrack = $('#tvTrack');
let vIdx = 0, vList = [];
function openViewer(stone) {
  select(stone);
  viewer.hidden = false; document.body.classList.add('tv-open'); lockScroll(true);
  history.pushState({ tv: 1 }, '');
  $('#tvDots').innerHTML = STONES.map(s => `<button class="dot ${s.id === stone ? 'is-on' : ''}" data-dot="${s.id}" style="background-image:url(${stoneImg(s.id, 1)})" aria-label="${s.name}"></button>`).join('');
  fillViewer(true);
  track('ViewContent', { content_name: stone });
}
function fillViewer(reset) {
  const s = stoneById(state.stone), c = catById(state.cat);
  const im = images(c.id, s.id);
  vList = im.list;
  if (reset || vIdx >= vList.length) vIdx = 0;
  $('#tvStone').textContent = s.name;
  $('#tvCat').textContent = c.name;
  $('#tvDesc').textContent = s.desc;
  $('.tv__ai').hidden = !im.ai;
  vTrack.innerHTML = vList.map(src => `<div class="tv__slide"><img src="${src}" alt="${s.name} ${c.name}" draggable="false"></div>`).join('');
  goSlide(vIdx);
  const on = $(`.dot[data-dot="${s.id}"]`);
  $$('.dot').forEach(d => d.classList.toggle('is-on', d === on));
  on && on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
function goSlide(i) {
  vIdx = (i + vList.length) % vList.length;
  vTrack.style.transform = `translate3d(${-vIdx * 100}%,0,0)`;
  $('#tvCount').textContent = vList.length > 1 ? `${vIdx + 1} / ${vList.length}` : '';
  $$('.tv__nav').forEach(b => b.hidden = vList.length < 2);
}
function closeViewer(fromPop) {
  if (viewer.hidden) return;
  viewer.hidden = true; document.body.classList.remove('tv-open'); lockScroll(false);
  if (!fromPop && history.state?.tv) history.back();
}
viewer.addEventListener('click', e => {
  if (e.target.closest('[data-vclose]')) return closeViewer();
  const n = e.target.closest('[data-vnav]'); if (n) return goSlide(vIdx + +n.dataset.vnav);
  const d = e.target.closest('[data-dot]');
  if (d) {
    const img = $$('.tv__slide img', vTrack);
    img.forEach(i => i.classList.add('swap'));
    setTimeout(() => { select(d.dataset.dot); fillViewer(false); }, 250);
  }
});
addEventListener('popstate', () => { closeViewer(true); closeWheel(true); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeWheel(); closeViewer(); }
  if (!viewer.hidden && e.key === 'ArrowRight') goSlide(vIdx + 1);
  if (!viewer.hidden && e.key === 'ArrowLeft') goSlide(vIdx - 1);
});
// swipe
let sx = null, sdx = 0;
const stage = $('#tvStage');
stage.addEventListener('pointerdown', e => { sx = e.clientX; sdx = 0; vTrack.style.transition = 'none'; });
stage.addEventListener('pointermove', e => { if (sx === null) return; sdx = e.clientX - sx; vTrack.style.transform = `translate3d(calc(${-vIdx * 100}% + ${sdx}px),0,0)`; });
const endSwipe = () => { if (sx === null) return; vTrack.style.transition = ''; if (Math.abs(sdx) > 50) goSlide(vIdx + (sdx < 0 ? 1 : -1)); else goSlide(vIdx); sx = null; };
stage.addEventListener('pointerup', endSwipe); stage.addEventListener('pointercancel', endSwipe); stage.addEventListener('pointerleave', endSwipe);

/* services tiles → open wheel with service */
$$('.tile[data-service]').forEach(t => t.addEventListener('click', () => {
  state.service = t.dataset.service;
  const c = CATS.find(c => c.service === state.service);
  if (c) { state.cat = c.id; renderCats(); renderThemes(); }
  openWheel();
}));

/* ================= WHEEL ================= */
const wm = $('#wheelModal'), wc = $('#wheelCanvas'), spinBtn = $('#spinBtn');
const steps = n => $$('.wm__step', wm).forEach(s => s.hidden = s.dataset.step !== n);
let lead = store.get('lead') || {};

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
  $('#leadForm [name=name]').value = lead.name || '';
  $('#leadForm [name=city]').value = lead.city || '';
  $$('#svcChips .chip').forEach(c => c.classList.toggle('is-on', c.textContent === state.service));
  const s = stoneById(state.stone);
  $('#wmPicked').innerHTML = s ? `<i style="background-image:url(${stoneImg(s.id, 1)})"></i><span>Seçtiğin mermer: <b>${s.name}</b></span>` : '';
  steps('form');
  track('InitiateCheckout');
}
function closeWheel(fromPop) {
  if (wm.hidden) return;
  wm.hidden = true; if (viewer.hidden) lockScroll(false);
  if (!fromPop && history.state?.wm) history.back();
}
document.addEventListener('click', e => { if (e.target.closest('[data-open-wheel]')) { e.preventDefault(); openWheel(); } });
$$('[data-close]', wm).forEach(b => b.addEventListener('click', () => closeWheel()));
$('#svcChips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  $$('#svcChips .chip').forEach(x => x.classList.toggle('is-on', x === c));
  state.service = c.textContent;
});
$('#leadForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, name = f.name.value.trim();
  if (name.length < 2) { f.name.classList.add('err'); f.name.focus(); return; }
  f.name.classList.remove('err');
  lead = { name, city: f.city.value.trim() };
  store.set('lead', lead);
  $('#wmHello').textContent = name.split(' ')[0];
  steps('spin');
});

let rot = 0, spinning = false;
spinBtn.addEventListener('click', () => {
  if (spinning) return; spinning = true; spinBtn.disabled = true;
  const total = PRIZES.reduce((a, p) => a + p.weight, 0);
  let r = Math.random() * total, idx = 0;
  for (; idx < PRIZES.length; idx++) { r -= PRIZES[idx].weight; if (r <= 0) break; }
  idx = Math.min(idx, PRIZES.length - 1);
  const seg = 360 / PRIZES.length;
  const jitter = (Math.random() - .5) * seg * .6;
  rot += 360 * 7 + (360 - ((rot % 360) + idx * seg + jitter) % 360);
  wc.style.transform = `rotate(${rot}deg)`;
  tick(6000);
  setTimeout(() => {
    const won = { prize: PRIZES[idx].label, code: 'SMG-' + Math.random().toString(36).slice(2, 6).toUpperCase(), at: Date.now() };
    store.set('win', won);
    spinning = false; spinBtn.disabled = false;
    showWin(won, true);
    track('Lead', { content_name: won.prize });
  }, 6200);
});
function tick(ms) { // haptic ticks on mobile
  if (!navigator.vibrate) return;
  const t0 = performance.now();
  let next = 0;
  (function f() { const p = (performance.now() - t0) / ms; if (p > 1) return; if (performance.now() > next) { navigator.vibrate(4); next = performance.now() + 40 + p * p * 400; } requestAnimationFrame(f); })();
}

let timerInt = null;
function showWin(won, fresh) {
  steps('win');
  $('#winPrize').textContent = won.prize;
  $('#winCode').textContent = won.code;
  const s = stoneById(state.stone), name = lead.name || '';
  $('#winSummary').innerHTML = [
    name && `Ad: <b>${esc(name)}</b>`, `İş: <b>${esc(state.service)}</b>`,
    s && `Mermer: <b>${s.name}</b>`, lead.city && `Konum: <b>${esc(lead.city)}</b>`,
  ].filter(Boolean).join(' · ');
  const msg = [
    `Merhaba ${OWNER} 👋`,
    `Şahin Mermer sitesindeki çarktan *${won.prize}* kazandım! 🎁`,
    `Hediye kodum: *${won.code}*`, '',
    name && `Ad: ${name}`,
    `Yaptırmak istediğim: ${state.service}`,
    s && `Beğendiğim mermer: ${s.name}`,
    lead.city && `Konum: ${lead.city}`, '',
    'Fiyat ve ücretsiz keşif için bilgi alabilir miyim?',
  ].filter(x => x !== false && x !== undefined && x !== null).join('\n');
  const a = $('#winWa'); a.href = waLink(msg);
  a.onclick = () => track('Contact', { content_name: won.prize });
  clearInterval(timerInt);
  const end = won.at + PRIZE_HOURS * 3600e3;
  const upd = () => { const d = Math.max(0, end - Date.now()); const h = Math.floor(d / 3600e3), m = Math.floor(d / 6e4) % 60, sec = Math.floor(d / 1e3) % 60; $('#winTimer').textContent = [h, m, sec].map(v => String(v).padStart(2, '0')).join(':'); };
  upd(); timerInt = setInterval(upd, 1000);
  if (fresh) confetti();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
renderCats(); renderThemes(); updateSel();

fetch('assets/gen/manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(m => { state.manifest = m || {}; renderThemes(); }).catch(() => {});

const pct = $('#loaderPct');
let shown = 0;
const pInt = setInterval(() => { shown = Math.min(shown + 3 + Math.random() * 6, 92); pct.textContent = shown | 0; }, 80);
function done() {
  clearInterval(pInt); pct.textContent = 100;
  setTimeout(() => { $('#loader').classList.add('done'); document.documentElement.classList.add('ready'); document.body.classList.add('ready'); $$('.hero .reveal').forEach(el => el.classList.add('in')); }, 250);
}
const failSafe = setTimeout(done, 4500);

import('./scene.js').then(async ({ createScene }) => {
  scene = await createScene($('#stage'), { stones: STONES.map(s => s.id), mobile: innerWidth < 720 });
  const lab = $('#ringLabels');
  lab.innerHTML = STONES.map(s => `<span>${s.name}</span>`).join('');
  scene.setLabels($$('span', lab));
  clearTimeout(failSafe); done(); onScroll();
}).catch(err => { console.warn('3D devre dışı:', err); clearTimeout(failSafe); done(); $('#stage').style.background = `url(${stoneImg('nero-marquina')}) center/cover`; });

onScroll();
