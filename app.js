const $ = s => document.querySelector(s);
const v = $('#v'), c = $('#c'), g = c.getContext('2d'), msg = $('#msg'), info = $('#info');
const ls = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set: (k, x) => { try { localStorage.setItem(k, JSON.stringify(x)); } catch (e) {} }
};
const UNITS = { kmh: [1, 'km/soat'], ms: [1 / 3.6, 'm/s'], mph: [0.621371, 'mph'] };
const CLS = ['car', 'truck', 'bus', 'motorcycle'];
const TYPE = { car: 'Yengil', truck: 'Yuk', bus: 'Avtobus', motorcycle: 'Mototsikl' };
const NAMES = [`yaqin chap`, `yaqin o'ng`, `uzoq o'ng`, `uzoq chap`];
let model, stream, facing = 'environment', H, HI, fps = 0, pts = [], cal = false, run = false;
let tracks = [], hist = ls.get('tl-hist') || [];
let infoOn = ls.get('tl-info') !== 0; // raqam/tur/rang ma'lumotini ko'rsatish

const say = t => { msg.textContent = t; };
const W = () => +$('#W').value, L = () => +$('#L').value;
const K = () => +$('#K').value || 1, LIM = () => +$('#lim').value || 0;
const U = () => UNITS[$('#unit').value];
const fmt = kmh => Math.round(kmh * U()[0]);
const next = cb => v.requestVideoFrameCallback ? v.requestVideoFrameCallback(cb) : requestAnimationFrame(t => cb(t, {}));

// ---- Sozlamalarni saqlash
const SET = ['W', 'L', 'K', 'lim', 'unit', 'conf', 'snd', 'auto', 'color', 'plate', 'model', 'grid', 'vfps', 'evi', 'ret'];
const gv = i => { const e = $('#' + i); return e.type === 'checkbox' ? e.checked : e.value; };
const sv = (i, x) => { const e = $('#' + i); if (e.type === 'checkbox') e.checked = !!x; else e.value = x; };
const s0 = ls.get('tl-set');
if (s0) SET.forEach(k => { if (s0[k] != null) sv(k, s0[k]); });
SET.forEach(k => $('#' + k).onchange = () => {
  ls.set('tl-set', Object.fromEntries(SET.map(i => [i, gv(i)])));
  render();
});

// ---- Natijalar
function render() {
  const u = U();
  $('#unitLbl').textContent = u[1];
  $('#h').innerHTML = hist.slice(0, 10).map(x =>
    `<li class="${LIM() && x.v > LIM() ? 'over' : ''}">${fmt(x.v)} ${u[1]}<small>${infoOn && x.rgb ? `<i class="sw" style="background:rgb(${x.rgb})"></i>${x.color} · ` : ''}${infoOn && x.plate ? `<b class="plate">${x.plate}</b> · ` : ''}${infoOn ? (x.type || '') + ' · ' : ''}${x.dir || ''} · ${x.time} · ${x.n} kadr · ±${(x.rms * 100).toFixed(0)} sm</small></li>`).join('');
  const n = hist.length, vs = hist.map(x => x.v);
  $('#sN').textContent = n;
  $('#sOver').textContent = LIM() ? vs.filter(q => q > LIM()).length : 0;
  $('#sMax').textContent = n ? fmt(Math.max(...vs)) : '—';
  $('#sAvg').textContent = n ? fmt(vs.reduce((a, b) => a + b) / n) : '—';
}

function show(r, fin) {
  const over = LIM() && r.v > LIM();
  $('#num').textContent = fmt(r.v);
  $('#disc').classList.toggle('over', !!over);
  $('#sub').textContent = `${r.n} kadr · ±${(r.rms * 100).toFixed(0)} sm` + (fin ? ' · yakuniy' : '') + (over ? ' · chegaradan oshdi' : '');
}

function finish(t) {
  const r = t.res;
  if (r && r.dt >= 0.25 && r.v >= 3) {
    show(r, 1);
    hist.unshift({ ...r, ...pickInfo(t), type: TYPE[t.cls] || 'Mashina', dir: r.vy > 0 ? 'uzoqlashmoqda' : 'yaqinlashmoqda', time: new Date().toLocaleTimeString() });
    ls.set('tl-hist', hist.slice(0, 200).map(({ plate, ...o }) => o)); // raqam saqlanmaydi
    if (LIM() && r.v > LIM() && t.shot && $('#evi').checked) saveEvidence(t, r, hist[0]);
    if (window.cloudSave) { const { plate, ...o } = hist[0]; cloudSave({ ...o, ts: Date.now() }); } // akkaunt bo'lsa bulutga
    render();
  }
}

// ---- Kuzatuv
function add(t, d, time) {
  const [X, Y] = mapPoint(H, d.gx, d.gy);
  if (X >= 0 && X <= W() && Y >= 0 && Y <= L()) t.s.push({ t: time, X, Y });
  if (t.s.length >= 4) {
    t.res = fitSpeed(t.s, K()); show(t.res, 0);
    if (LIM() && t.res.v > LIM() && !t.alerted) { t.alerted = true; alarm(t); }
  }
}

function process(dets, time) {
  const cur = dets.filter(d => CLS.includes(d.class) && d.score > (+$('#conf').value || 0.5))
    .map(d => ({ cls: d.class, bbox: d.bbox, gx: d.bbox[0] + d.bbox[2] / 2, gy: d.bbox[1] + d.bbox[3] }));
  const used = new Set();
  for (const t of tracks) {
    let best = -1, bd = c.width * 0.25;
    cur.forEach((d, i) => {
      if (used.has(i)) return;
      const e = Math.hypot(d.gx - t.gx, d.gy - t.gy);
      if (e < bd) { bd = e; best = i; }
    });
    if (best < 0) continue;
    used.add(best);
    const d = cur[best];
    Object.assign(t, { gx: d.gx, gy: d.gy, bbox: d.bbox, seen: time });
    add(t, d, time); observe(t);
  }
  cur.forEach((d, i) => {
    if (used.has(i)) return;
    const t = { cls: d.cls, gx: d.gx, gy: d.gy, bbox: d.bbox, seen: time, s: [] };
    add(t, d, time); observe(t);
    tracks.push(t);
  });
  tracks = tracks.filter(t => { if (time - t.seen > 700) { finish(t); return false; } return true; });
}

function loop(now, meta) {
  if (!run) return;
  const time = meta.captureTime || meta.expectedDisplayTime || now; // kadr olingan vaqt
  checkShake(now);
  model.detect(v).then(d => process(d, time)).catch(() => {}).finally(() => run && next(loop));
}

// ---- Chizish
function draw() {
  const s = c.width / 640;
  g.clearRect(0, 0, c.width, c.height);
  g.lineWidth = 2 * s;
  g.font = `bold ${16 * s}px sans-serif`;
  if (pts.length) {
    g.strokeStyle = g.fillStyle = '#ffd23f';
    g.beginPath();
    pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    if (pts.length === 4) g.closePath();
    g.stroke();
    pts.forEach((p, i) => {
      g.beginPath(); g.arc(p[0], p[1], 5 * s, 0, 7); g.fill();
      g.fillText(i + 1, p[0] + 8 * s, p[1] - 8 * s);
    });
  }
  if (HI && $('#grid').checked) { // 1 metrli to'r: kalibrovkani ko'z bilan tekshirish uchun
    g.strokeStyle = 'rgba(255,210,63,.45)'; g.lineWidth = s;
    const P = (X, Y) => mapPoint(HI, X, Y), ln = (p, q) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
    for (let X = 0; X <= W(); X++) ln(P(X, 0), P(X, L()));
    for (let Y = 0; Y <= L(); Y++) ln(P(0, Y), P(W(), Y));
  }
  tracks.forEach(t => {
    // Har bir mashina o'z ramkasida, tezlik ramka tepasida
    const [x, y, w, h] = t.bbox, over = LIM() && t.res && t.res.v > LIM();
    const col = over ? '#d6322e' : '#2fbf71';
    g.strokeStyle = col; g.lineWidth = 3 * s;
    g.strokeRect(x, y, w, h);
    const lines = [t.res ? fmt(t.res.v) + ' ' + U()[1] : '…'];
    if (infoOn) {
      const inf = pickInfo(t), meta = [TYPE[t.cls], inf.color].filter(Boolean).join(' · ');
      if (meta) lines.push(meta);
      if (inf.plate) lines.push(inf.plate);
    }
    const sizes = lines.map((_, i) => i ? 14 * s : 22 * s), pad = 6 * s;
    const tw = Math.max(...lines.map((l, i) => { g.font = `bold ${sizes[i]}px sans-serif`; return g.measureText(l).width; })) + pad * 2;
    const th = sizes.reduce((q, z) => q + z * 1.3, 0) + pad;
    const lx = Math.max(0, Math.min(x, c.width - tw)), ly = y - th < 0 ? y : y - th;
    g.fillStyle = col; g.fillRect(lx, ly, tw, th);
    g.fillStyle = '#fff';
    let yy = ly + pad / 2;
    lines.forEach((l, i) => { g.font = `bold ${sizes[i]}px sans-serif`; yy += sizes[i] * 1.15; g.fillText(l, lx + pad, yy); yy += sizes[i] * 0.15; });
  });
  if (run || analyzing || rx) { // kuzatuv e'loni: yozuv va rasmlarda ham ko'rinadi
    const fz = 13 * s, nt = `● VIDEO KUZATUV · taxminiy o'lchov`;
    g.font = `bold ${fz}px sans-serif`;
    g.fillStyle = 'rgba(214,50,46,.9)'; g.fillRect(6 * s, 6 * s, g.measureText(nt).width + 12 * s, fz * 1.8);
    g.fillStyle = '#fff'; g.fillText(nt, 12 * s, 6 * s + fz * 1.3);
  }
  if (rx) { rx.drawImage(v, 0, 0); rx.drawImage(c, 0, 0); }
  requestAnimationFrame(draw);
}

// ---- Kamera
async function openCam() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    run = false; analyzing = false; mode = 'cam'; v.removeAttribute('src'); $('#bRun').textContent = 'Boshlash';
    say('Kamera ochilmoqda…');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }, audio: false
    });
    v.srcObject = stream; await v.play();
    c.width = v.videoWidth; c.height = v.videoHeight;
    $('#st').style.aspectRatio = c.width + '/' + c.height;
    fps = Math.round(stream.getVideoTracks()[0].getSettings().frameRate || 0);
    pts = []; H = null; tracks = [];
    ['bRun', 'bSave'].forEach(i => $('#' + i).disabled = true);
    await loadModel(); startDraw();
    ['bFlip', 'bCal', 'bLoad'].forEach(i => $('#' + i).disabled = false);
    say(`Kamera tayyor (${fps} FPS). Yo'l o'lchamlarini kiriting va «4 nuqtani belgilash»ni bosing.`);
  } catch (e) {
    say(`Kamera ochilmadi. Sahifa HTTPS orqali ochilganini va kamera ruxsati berilganini tekshiring.`);
  }
}
$('#bCam').onclick = () => accepted ? openCam() : $('#rules').showModal();
$('#bFlip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; openCam(); };

// ---- Kalibrovka
function quadOk(p) { // qavariq va yetarlicha katta to'rtburchakmi
  let sg = 0, ar = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], d = p[(i + 2) % 4];
    sg += ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0])) > 0 ? 1 : -1;
    ar += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sg) === 4 && Math.abs(ar) / 2 > c.width * c.height * 0.01;
}
function setH() {
  const dst = [[0, 0], [W(), 0], [W(), L()], [0, L()]];
  if (quadOk(pts)) {
    H = solveH(pts, dst); HI = solveH(dst, pts);
    if (H.every(isFinite) && HI.every(isFinite)) { $('#bRun').disabled = false; $('#bSave').disabled = false; return true; }
  }
  H = HI = null; pts = []; return false;
}

$('#bCal').onclick = () => {
  if (!(W() > 0 && L() > 0)) return say(`Avval yo'l eni va uzunligini metrda kiriting.`);
  pts = []; H = null; cal = true; run = false;
  $('#bRun').disabled = true; $('#bRun').textContent = 'Boshlash';
  say(`1-nuqta: ${NAMES[0]} burchakni bosing.`);
};

const cpos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
c.onpointerdown = e => {
  if (!cal && pts.length === 4) { // tayyor nuqtani barmoq bilan surish
    const p = cpos(e), i = pts.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < c.width * 0.04);
    if (i >= 0) { drag = i; old = pts.map(q => q.slice()); c.setPointerCapture(e.pointerId); }
    return;
  }
  if (!cal) return;
  const r = c.getBoundingClientRect();
  pts.push([(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]);
  if (pts.length < 4) return say(`${pts.length + 1}-nuqta: ${NAMES[pts.length]} burchak.`);
  cal = false;
  say(setH() ? `Kalibrovka tayyor. Kamerani qimirlatmang va «Boshlash»ni bosing.` : `Nuqtalar noto'g'ri joylashgan. Qaytadan belgilang.`);
};

$('#bSave').onclick = () => { ls.set('tl-cal', { pts, W: W(), L: L(), w: c.width, h: c.height }); say('Kalibrovka saqlandi.'); };
$('#bLoad').onclick = () => {
  const d = ls.get('tl-cal');
  if (!d || d.w !== c.width || d.h !== c.height) return say(`Saqlangan kalibrovka yo'q yoki kamera o'lchami boshqacha.`);
  $('#W').value = d.W; $('#L').value = d.L; pts = d.pts;
  say(setH() ? `Saqlangan kalibrovka yuklandi. Kamera joyi o'zgarmagan bo'lsagina ishonchli.` : `Saqlangan kalibrovka yaroqsiz.`);
};

// ---- Boshqaruv
$('#bRun').onclick = () => {
  if (mode === 'file') return analyze();
  run = !run; keepAwake(run);
  $('#bRun').textContent = run ? `To'xtatish` : 'Boshlash';
  if (run) { tracks = []; ref = null; shakeN = 0; say(`O'lchanmoqda. Mashina sariq to'rtburchak ichidan o'tganda tezlik chiqadi.`); next(loop); }
  else { tracks.forEach(finish); tracks = []; say(`To'xtatildi.`); }
};

$('#bClr').onclick = () => {
  hist = []; ls.set('tl-hist', []); render();
  $('#num').textContent = '—'; $('#disc').classList.remove('over'); $('#sub').textContent = 'Natija shu yerda chiqadi';
};

$('#bCsv').onclick = () => {
  if (!hist.length) return say(`Hali natija yo'q.`);
  const rows = ['vaqt,turi,rang,raqam,yonalish,tezlik_kmh,kadrlar,xato_sm',
    ...hist.slice().reverse().map(x => [x.time, x.type, x.color || '', x.plate || '', x.dir, x.v.toFixed(1), x.n, (x.rms * 100).toFixed(1)].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = 'tezlik-natijalar.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---- Ogohlantirish, rasm va qo'shimcha funksiyalar
function beep() {
  try {
    const ac = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), gn = ac.createGain();
    o.frequency.value = 880; gn.gain.value = 0.2;
    o.connect(gn); gn.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.35);
  } catch (e) {}
}
function snapshot() {
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'), s = c.width / 640;
  x.drawImage(v, 0, 0); x.drawImage(c, 0, 0);
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, o.height - 30 * s, o.width, 30 * s);
  x.fillStyle = '#fff'; x.font = `bold ${16 * s}px sans-serif`;
  x.fillText(new Date().toLocaleString(), 10 * s, o.height - 9 * s);
  o.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'tezlik-' + Date.now() + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
function alarm(t) {
  if ($('#evi').checked) t.shot = shotURL(); // dalil uchun kadr (keyin yakuniy natija bilan saqlanadi)
  if ($('#snd').checked) beep();
  if ($('#auto').checked) snapshot();
  if (navigator.vibrate) navigator.vibrate(200);
}
$('#bShot').onclick = () => v.videoWidth ? snapshot() : say('Avval kamerani yoqing.');

let passes = ls.get('tl-pass') || [];
$('#bK').onclick = () => { // aniqlikni sinash: har o'tish qo'shiladi, koeffitsient mediandan olinadi
  const real = +$('#real').value, last = hist[0];
  if (!(real > 0) || !last || !last.raw) return say(`Avval GPS tezligini kiriting va kamida bitta o'lchov qiling.`);
  if (passes.some(p => p.raw === last.raw)) return say(`Bu o'tish allaqachon qo'shilgan. Yangi o'tish qiling.`);
  passes.push({ real, raw: last.raw }); ls.set('tl-pass', passes);
  const ks = passes.map(p => p.real / p.raw).sort((x, y) => x - y), k = ks[ks.length >> 1];
  const err = passes.reduce((q, p) => q + Math.abs(p.raw * k - p.real) / p.real, 0) / passes.length * 100;
  $('#K').value = k.toFixed(3); $('#K').onchange();
  say(`Sinov: ${passes.length} ta o'tish, koeffitsient ${k.toFixed(3)} (median), o'rtacha xato ±${err.toFixed(1)}%.`);
};
$('#bKClr').onclick = () => { passes = []; ls.set('tl-pass', []); say(`Sinov tarixi tozalandi.`); };

let wl;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock) wl = await navigator.wakeLock.request('screen');
    else if (wl) { await wl.release(); wl = null; }
  } catch (e) {}
}

const root = document.documentElement;
root.dataset.theme = ls.get('tl-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#bTheme').onclick = () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  ls.set('tl-theme', root.dataset.theme);
};
$('#bFull').onclick = () => document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen && root.requestFullscreen();

// ---- Rang va davlat raqami
const sc = document.createElement('canvas');
sc.width = sc.height = 24;
const sx = sc.getContext('2d', { willReadFrequently: true });

function sampleColor(b) { // kuzovning o'rtasidan (oyna va g'ildirakdan tashqari) median rang
  const [x, y, w, h] = b;
  sx.drawImage(v, x + w * 0.3, y + h * 0.35, w * 0.4, h * 0.3, 0, 0, 24, 24);
  const d = sx.getImageData(0, 0, 24, 24).data, ch = [[], [], []];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(d[i + k]);
  return ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
}

function colorName([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  if (l < 0.16) return 'Qora';
  if (s < 0.14) return l > 0.72 ? 'Oq' : l > 0.42 ? 'Kumush' : 'Kulrang';
  if (h < 15 || h >= 345) return 'Qizil';
  if (h < 40) return l < 0.38 ? 'Jigarrang' : "To'q sariq";
  if (h < 70) return 'Sariq';
  if (h < 165) return 'Yashil';
  if (h < 200) return 'Moviy';
  if (h < 255) return "Ko'k";
  return 'Binafsha';
}

let ocr, ocrBusy = false, ocrLoading = false;
function loadOcr() {
  if (ocr || ocrLoading) return;
  ocrLoading = true; say(`Raqam o'qish moduli yuklanmoqda…`);
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  s.onload = async () => {
    try {
      ocr = await Tesseract.createWorker('eng');
      await ocr.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', tessedit_pageseg_mode: '11' });
      say(`Raqam o'qish moduli tayyor.`);
    } catch (e) { say(`Raqam o'qish moduli yuklanmadi.`); }
    ocrLoading = false;
  };
  s.onerror = () => { ocrLoading = false; say(`Raqam o'qish moduli yuklanmadi (internetni tekshiring).`); };
  document.head.appendChild(s);
}

function readPlate(t) { // mashinaning pastki qismidan raqam qidiradi
  const [x, y, w, h] = t.bbox, now = performance.now();
  if (!ocr || ocrBusy || t.plate || w < c.width * 0.18 || (t.ocrN || 0) >= 6 || now - (t.ocrT || 0) < 700) return;
  ocrBusy = true; t.ocrT = now; t.ocrN = (t.ocrN || 0) + 1;
  const o = document.createElement('canvas');
  o.width = Math.round(w * 0.7 * 3); o.height = Math.round(h * 0.35 * 3);
  const q = o.getContext('2d');
  q.filter = 'grayscale(1) contrast(1.8)';
  q.drawImage(v, x + w * 0.15, y + h * 0.65, w * 0.7, h * 0.35, 0, 0, o.width, o.height);
  ocr.recognize(o).then(({ data }) => {
    const m = data.text.replace(/\s+/g, '').match(/\d{2}[A-Z]\d{3}[A-Z]{2}|\d{5}[A-Z]{3}/);
    if (m) t.plate = m[0];
  }).catch(() => {}).finally(() => { ocrBusy = false; });
}

function observe(t) {
  if ($('#color').checked && t.bbox[2] > c.width * 0.08) {
    t.cols = t.cols || [];
    if (t.cols.length < 12) t.cols.push(sampleColor(t.bbox));
  }
  if ($('#plate').checked) readPlate(t);
}

function pickInfo(t) {
  const out = { plate: t.plate || '' };
  if (t.cols && t.cols.length) {
    const names = t.cols.map(colorName), cnt = {};
    names.forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
    const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    out.color = best; out.rgb = t.cols[names.lastIndexOf(best)];
  }
  return out;
}

$('#plate').addEventListener('change', () => { if ($('#plate').checked) loadOcr(); });
if ($('#plate').checked) loadOcr();

// ---- Ma'lumotni yoqish/o'chirish tugmasi
function syncInfo() {
  const b = $('#bInfo');
  b.textContent = `Mashina ma'lumoti: ${infoOn ? 'yoqilgan' : "o'chirilgan"}`;
  b.setAttribute('aria-pressed', infoOn);
  render();
}
$('#bInfo').onclick = () => { infoOn = !infoOn; ls.set('tl-info', infoOn ? 1 : 0); syncInfo(); };
syncInfo();

// ---- Model, video fayl, siljish, yozib olish, hisobot
let drag = -1, old = null, mode = 'cam', analyzing = false, drawing = false, modelBase = null;
let ref = null, shakeN = 0, shakeT = 0, rec, recChunks = [], rx = null;
const startDraw = () => { if (!drawing) { drawing = true; draw(); } };
async function loadModel() {
  const base = $('#model').value;
  if (model && modelBase === base) return;
  say('Model yuklanmoqda…'); model = await cocoSsd.load({ base }); modelBase = base;
}
$('#model').addEventListener('change', () => { if (model) loadModel().then(() => say('Model almashtirildi.')); });

c.onpointermove = e => { if (drag >= 0) pts[drag] = cpos(e); };
c.onpointerup = () => {
  if (drag < 0) return;
  drag = -1;
  if (setH()) return say('Nuqta yangilandi.');
  pts = old; setH(); say(`Bunday joylashuv mumkin emas, avvalgisi qaytarildi.`);
};

// Kamera siljishi: kadr burchaklaridagi fon bo'laklari boshlang'ich holatga solishtiriladi
const th = document.createElement('canvas'); th.width = 128; th.height = 72;
const tx = th.getContext('2d', { willReadFrequently: true });
const PATCH = [[4, 4], [108, 4], [4, 58], [108, 58]];
function thumb() {
  tx.drawImage(v, 0, 0, 128, 72);
  const d = tx.getImageData(0, 0, 128, 72).data, a = new Uint8Array(128 * 72);
  for (let i = 0; i < a.length; i++) a[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return a;
}
function shifted(a, b) {
  let moved = 0;
  for (const [px, py] of PATCH) {
    let best = 1e9, bx = 0, by = 0, s0 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      let sad = 0;
      for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++)
        sad += Math.abs(a[(py + y) * 128 + px + x] - b[(py + y + dy) * 128 + px + x + dx]);
      if (!dx && !dy) s0 = sad;
      if (sad < best) { best = sad; bx = dx; by = dy; }
    }
    if ((bx || by) && best < s0 * 0.8) moved++;
  }
  return moved >= 3;
}
function checkShake(now) {
  if (now - shakeT < 1000) return;
  shakeT = now;
  const cur = thumb();
  if (!ref) { ref = cur; return; }
  shakeN = shifted(ref, cur) ? shakeN + 1 : 0;
  if (shakeN === 2) { say(`Diqqat: kamera siljigan bo'lishi mumkin. Kalibrovkani qayta tekshiring.`); beep(); }
}

// Yozilgan videoni kadr-kadr tahlil qilish (jonli rejimdan aniqroq)
$('#bFile').onclick = () => accepted ? $('#file').click() : $('#rules').showModal();
$('#file').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    run = false; analyzing = false; mode = 'file';
    v.srcObject = null; v.src = URL.createObjectURL(f);
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; });
    c.width = v.videoWidth; c.height = v.videoHeight;
    $('#st').style.aspectRatio = c.width + '/' + c.height;
    pts = []; H = HI = null; tracks = [];
    await loadModel(); startDraw();
    ['bCal', 'bLoad'].forEach(i => $('#' + i).disabled = false);
    ['bRun', 'bSave'].forEach(i => $('#' + i).disabled = true);
    $('#bRun').textContent = 'Tahlilni boshlash';
    say(`Video yuklandi. Yo'l o'lchamlarini kiriting, «4 nuqtani belgilash»ni bosing, so'ng «Tahlilni boshlash».`);
  } catch (err) { say(`Videoni ochib bo'lmadi.`); }
  e.target.value = '';
};
async function analyze() {
  if (analyzing) { analyzing = false; return; }
  if (!H) return say('Avval kalibrovka qiling.');
  analyzing = true; tracks = [];
  const step = 1 / (+$('#vfps').value || 30), dur = v.duration;
  $('#bRun').textContent = `To'xtatish`;
  for (let t = 0, n = 0; t < dur && analyzing; t = ++n * step) {
    await new Promise(ok => { if (Math.abs(v.currentTime - t) < 1e-3) return ok(); v.onseeked = ok; v.currentTime = t; });
    process(await model.detect(v), t * 1000);
    if (n % 5 === 0) say(`Tahlil: ${Math.round(100 * t / dur)}%`);
  }
  tracks.forEach(finish); tracks = [];
  analyzing = false; $('#bRun').textContent = 'Tahlilni boshlash';
  say(`Tahlil tugadi. «Hisobot» tugmasi bilan natijalarni ko'ring.`);
}

// Tezlik yozilgan holda videoni saqlash
$('#bRec').onclick = () => {
  if (rec && rec.state === 'recording') return rec.stop();
  if (!v.videoWidth) return say('Avval kamerani yoqing.');
  const rc = document.createElement('canvas'); rc.width = c.width; rc.height = c.height; rx = rc.getContext('2d');
  rec = new MediaRecorder(rc.captureStream(30), MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? { mimeType: 'video/webm;codecs=vp9' } : {});
  recChunks = [];
  rec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(recChunks, { type: 'video/webm' })); a.download = 'tezlik-' + Date.now() + '.webm'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    rx = null; $('#bRec').textContent = 'Yozib olish';
  };
  rec.start(); $('#bRec').textContent = `Yozishni to'xtatish`;
};

// Hisobot: statistika, yo'nalish/tur/rang bo'yicha soni va gistogramma
$('#bRep').onclick = () => {
  const n = hist.length;
  if (!n) return say(`Hisobot uchun natija yo'q.`);
  const vs = hist.map(x => x.v), avg = vs.reduce((x, y) => x + y) / n, over = LIM() ? vs.filter(q => q > LIM()).length : 0;
  const cnt = f => { const m = {}; hist.forEach(x => { const k = f(x) || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, q]) => `${k}: ${q}`).join(', '); };
  const dirAvg = d => { const a = hist.filter(x => x.dir === d).map(x => x.v); return a.length ? ` (o'rtacha ${fmt(a.reduce((x, y) => x + y) / a.length)})` : ''; };
  $('#repTxt').innerHTML = [
    `Jami <b>${n}</b> · o'rtacha <b>${fmt(avg)}</b> · eng yuqori <b>${fmt(Math.max(...vs))}</b> ${U()[1]}`,
    LIM() ? `Chegaradan oshgan: <b>${over}</b> (${Math.round(100 * over / n)}%)` : '',
    `Yaqinlashayotgan${dirAvg('yaqinlashmoqda')}: ${hist.filter(x => x.dir === 'yaqinlashmoqda').length} · Uzoqlashayotgan${dirAvg('uzoqlashmoqda')}: ${hist.filter(x => x.dir === 'uzoqlashmoqda').length}`,
    `Tur: ${cnt(x => x.type)}`, `Rang: ${cnt(x => x.color)}`
  ].filter(Boolean).map(s => `<p>${s}</p>`).join('');
  const cv = $('#hist'), q = cv.getContext('2d'), bins = {};
  vs.forEach(x => { const b = Math.floor(x / 10); bins[b] = (bins[b] || 0) + 1; });
  const ks = Object.keys(bins).map(Number), lo = Math.min(...ks), hi = Math.max(...ks), mx = Math.max(...Object.values(bins));
  const bw = cv.width / (hi - lo + 1), mut = getComputedStyle(root).getPropertyValue('--mut');
  q.clearRect(0, 0, cv.width, cv.height); q.font = '14px sans-serif';
  for (let b = lo; b <= hi; b++) {
    const bh = (bins[b] || 0) / mx * (cv.height - 30);
    q.fillStyle = LIM() && b * 10 >= LIM() ? '#d6322e' : '#1f5fbf';
    q.fillRect((b - lo) * bw + 3, cv.height - 20 - bh, bw - 6, bh);
    q.fillStyle = mut; q.fillText(b * 10, (b - lo) * bw + 4, cv.height - 4);
  }
  $('#rep').showModal();
};

// ---- Qoidalar va dalillar
const RV = 'tl-rules-v2'; // qoidalar yangilanganda qayta rozilik so'raladi
let accepted = !!ls.get(RV);
$('#agree').checked = $('#agree2').checked = accepted;
$('#bAgree').disabled = !accepted;
const agreeSync = () => { $('#bAgree').disabled = !($('#agree').checked && $('#agree2').checked); };
$('#agree').onchange = $('#agree2').onchange = agreeSync;
$('#rules').addEventListener('cancel', e => { if (!accepted) e.preventDefault(); });
$('#rules').addEventListener('close', () => { if ($('#agree').checked && $('#agree2').checked) { accepted = true; ls.set(RV, 1); } });
$('#bRules').onclick = () => $('#rules').showModal();

const db = new Promise((ok, no) => {
  const q = indexedDB.open('tl-evidence', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('e', { keyPath: 'id' });
  q.onsuccess = () => ok(q.result); q.onerror = no;
});
const idb = (mode, fn) => db.then(d => new Promise((ok, no) => {
  const t = d.transaction('e', mode), r = fn(t.objectStore('e'));
  t.oncomplete = () => ok(r.result); t.onerror = no;
}));
const evCount = () => idb('readonly', s => s.count()).then(n => { $('#bEvi').textContent = `Dalillar (${n})`; }).catch(() => {});

function shotURL() {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'), s = c.width / 640;
  x.drawImage(v, 0, 0); x.drawImage(c, 0, 0);
  x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(0, o.height - 30 * s, o.width, 30 * s);
  x.fillStyle = '#fff'; x.font = `bold ${14 * s}px sans-serif`;
  x.fillText(`${new Date().toLocaleString()} · TAXMINIY O'LCHOV, RASMIY EMAS`, 10 * s, o.height - 10 * s);
  return o.toDataURL('image/jpeg', 0.85);
}
async function sha(txt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(b)].map(q => q.toString(16).padStart(2, '0')).join('');
}
async function saveEvidence(t, r, e) {
  const meta = {
    id: Date.now(), vaqt: new Date().toISOString(), tezlik_kmh: +r.v.toFixed(1), xom_tezlik_kmh: +r.raw.toFixed(1),
    koeffitsient: K(), chegara_kmh: LIM(), kadrlar: r.n, davomiylik_s: +r.dt.toFixed(2), xato_sm: +(r.rms * 100).toFixed(1),
    tur: e.type || '', rang: e.color || '', raqam: e.plate || '', yonalish: e.dir || '',
    kalibrovka: { nuqtalar: pts.map(p => p.map(Math.round)), eni_m: W(), uzunligi_m: L(), olcham: c.width + 'x' + c.height },
    kamera_fps: fps, model: modelBase, manba: mode === 'file' ? 'video fayl' : 'jonli kamera',
    siljish_ogohlantirishi: shakeN >= 2, izoh: `Taxminiy o'lchov; rasmiy radar emas.`
  };
  const rec = { ...meta, img: t.shot, xesh: await sha(JSON.stringify(meta) + t.shot) };
  try { await idb('readwrite', s => s.put(rec)); evCount(); } catch (err) {}
}
$('#bEvi').onclick = async () => {
  const list = (await idb('readonly', s => s.getAll())).sort((a, b) => b.id - a.id);
  $('#evList').innerHTML = list.map(e => `<div class="ev"><img src="${e.img}" alt=""><div><b>${Math.round(e.tezlik_kmh)} km/soat</b> (chegara ${e.chegara_kmh})<br>${new Date(e.vaqt).toLocaleString()}<br>${e.tur}${e.rang ? ' · ' + e.rang : ''}${e.raqam ? ' · ' + e.raqam : ''}<br><small>SHA-256: ${e.xesh.slice(0, 16)}…</small><br><a href="${e.img}" download="dalil-${e.id}.jpg">Rasm</a></div></div>`).join('') || `<p>Hozircha dalil yo'q.</p>`;
  $('#evd').showModal();
};
$('#evDl').onclick = async () => {
  const list = await idb('readonly', s => s.getAll());
  if (!list.length) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(list, null, 1)], { type: 'application/json' }));
  a.download = 'dalillar-' + Date.now() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};
$('#evClr').onclick = async () => {
  if (!confirm(`Barcha dalillar o'chirilsinmi?`)) return;
  await idb('readwrite', s => s.clear()); evCount(); $('#evList').innerHTML = '';
};
evCount();

// ---- Huquqiy asos oynasi va ma'lumotni cheklash (saqlash muddati)
$('#bLaw').onclick = $('#bLaw2').onclick = () => $('#law').showModal();
$('#lnkLaw').onclick = e => { e.preventDefault(); $('#law').showModal(); };
async function cleanup() { // muddati o'tgan dalillar avtomatik o'chiriladi
  const days = +$('#ret').value;
  if (!(days > 0)) return;
  const cut = Date.now() - days * 864e5;
  const old = (await idb('readonly', s => s.getAll())).filter(e => e.id < cut);
  if (old.length) { await idb('readwrite', s => { old.forEach(e => s.delete(e.id)); return { result: 0 }; }); evCount(); }
}
cleanup().catch(() => {});

// ---- Kirish oynasi
$('#nomore').checked = !!ls.get('tl-seen');
$('#bHelp').onclick = () => info.showModal();
info.onclose = () => ls.set('tl-seen', $('#nomore').checked ? 1 : 0);
if (!ls.get('tl-seen')) info.showModal();
if (!accepted) $('#rules').showModal(); // qoidalar tepada, roziliksiz yopilmaydi
render();
