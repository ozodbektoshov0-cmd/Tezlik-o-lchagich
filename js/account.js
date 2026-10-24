// Akkaunt (ixtiyoriy, Firebase) va Tarix oynasi.
// firebase-config.js bo'sh bo'lsa: akkaunt o'chiq, Tarix esa shu qurilmadagi natijalar bilan ishlaydi.
(() => {
  'use strict';
  const q = s => document.querySelector(s);
  const cfg = window.FIREBASE_CONFIG;
  const enabled = !!(cfg && cfg.apiKey && cfg.projectId);
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ERR = {
    'auth/invalid-email': "Email noto'g'ri yozilgan.",
    'auth/missing-password': 'Parolni kiriting.',
    'auth/weak-password': "Parol juda qisqa (kamida 6 belgi).",
    'auth/email-already-in-use': "Bu email bilan akkaunt allaqachon bor. «Kirish»ni bosing.",
    'auth/invalid-credential': "Email yoki parol noto'g'ri.",
    'auth/user-not-found': "Bunday akkaunt topilmadi.",
    'auth/wrong-password': "Parol noto'g'ri.",
    'auth/too-many-requests': "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.",
    'auth/network-request-failed': 'Internet bilan aloqa yo\'q.',
    'auth/popup-closed-by-user': 'Oyna yopildi.',
    'auth/popup-blocked': "Brauzer oynani blokladi. Popup'ga ruxsat bering.",
    'auth/unauthorized-domain': "Bu domen Firebase'da ruxsat etilmagan (Authorized domains).",
    'auth/operation-not-allowed': "Bu kirish usuli Firebase'da yoqilmagan."
  };
  const errText = e => (e && ERR[e.code]) || (e && e.message) || 'Xatolik yuz berdi.';
  const authMsg = t => { q('#authMsg').textContent = t || ''; };

  let fb = null, user = null, cloud = [], initP = null;
  const col = () => fb.fs.collection('users').doc(user.uid).collection('passes');

  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => no(new Error('Firebase yuklanmadi. Internetni tekshiring.'));
      document.head.appendChild(s);
    });
  }
  function init() {
    if (!enabled) return Promise.reject(new Error("Bulut akkaunti sozlanmagan."));
    if (initP) return initP;
    initP = (async () => {
      await loadScript(SDK + 'firebase-app-compat.js');
      await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
      firebase.initializeApp(cfg);
      fb = { auth: firebase.auth(), fs: firebase.firestore() };
      fb.auth.onAuthStateChanged(u => { user = u; cloud = []; syncUi(); if (u) pullCloud(); });
    })().catch(e => { initP = null; throw e; });
    return initP;
  }

  function syncUi() {
    q('#bAcc').textContent = user ? (user.email || 'Akkaunt') : 'Kirish';
    q('#aForm').hidden = !enabled || !!user;
    q('#aOut').hidden = !user;
    q('#tTitle').textContent = user ? 'Tarix (bulut)' : 'Tarix';
    authMsg(!enabled ? "Bulut akkaunti sozlanmagan. Dastur akkauntsiz ishlaydi: natijalar shu qurilmada saqlanadi."
      : user ? 'Kirdingiz: ' + (user.email || '') : '');
  }

  async function pullCloud() {
    try {
      const s = await col().orderBy('ts', 'desc').limit(500).get();
      cloud = s.docs.map(d => ({ ...d.data(), _id: d.id }));
    } catch (e) { console.error(e); cloud = []; }
    if (q('#tarix').open) drawTarix();
  }

  // app.js natija chiqqanda chaqiradi
  window.cloudSave = o => {
    if (!fb || !user) return;
    const data = JSON.parse(JSON.stringify(o)); // undefined maydonlarni olib tashlaydi (Firestore ularni qabul qilmaydi)
    col().add(data).then(r => { cloud.unshift({ ...data, _id: r.id }); if (q('#tarix').open) drawTarix(); }).catch(e => console.error(e));
  };

  // ---- Kirish oynasi
  q('#bAcc').onclick = () => {
    syncUi();
    q('#auth').showModal();
    if (enabled) init().catch(e => authMsg(errText(e)));
  };
  const run = async fn => {
    try { authMsg('Kuting…'); await init(); await fn(); syncUi(); }
    catch (e) { authMsg(errText(e)); }
  };
  const cred = () => {
    const m = q('#aMail').value.trim(), p = q('#aPass').value;
    if (!m || !p) throw new Error('Email va parolni kiriting.');
    return [m, p];
  };
  q('#aIn').onclick = () => run(async () => { await fb.auth.signInWithEmailAndPassword(...cred()); q('#aPass').value = ''; });
  q('#aUp').onclick = () => run(async () => { await fb.auth.createUserWithEmailAndPassword(...cred()); q('#aPass').value = ''; });
  q('#aG').onclick = () => run(() => fb.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()));
  q('#aOut').onclick = () => run(() => fb.auth.signOut());
  q('#aPass').addEventListener('keydown', e => { if (e.key === 'Enter') q('#aIn').click(); });
  syncUi();
  if (enabled) init().catch(() => {}); // oldingi kirish holatini tiklash

  // ---- Tarix oynasi
  const items = () => user ? cloud : hist;
  function filtered() {
    const f = q('#tFrom').value, t = q('#tTo').value, only = q('#tOver').checked;
    const a = f ? new Date(f + 'T00:00:00').getTime() : -Infinity;
    const b = t ? new Date(t + 'T23:59:59.999').getTime() : Infinity;
    return items().map((x, i) => ({ x, i })).filter(({ x }) =>
      (!(f || t) || (x.ts && x.ts >= a && x.ts <= b)) && (!only || (LIM() && x.v > LIM())));
  }
  const when = x => x.ts ? new Date(x.ts).toLocaleString() : (x.time || '');
  function drawTarix() {
    const u = U(), rows = filtered();
    q('#tCount').textContent = `${rows.length} ta natija · ${user ? 'bulut' : 'shu qurilma'}` + (rows.length > 300 ? ' (birinchi 300 tasi ko\'rsatilgan)' : '');
    q('#tList').innerHTML = rows.slice(0, 300).map(({ x, i }) =>
      `<li class="${LIM() && x.v > LIM() ? 'over' : ''}">${fmt(x.v)} ${u[1]}<small>${esc(x.type || '')}${x.color ? ' · ' + esc(x.color) : ''} · ${esc(x.dir || '')} · ${esc(when(x))}</small><button class="del" data-i="${i}" type="button">O'chirish</button></li>`
    ).join('') || '<li>Natija yo\'q.</li>';
  }
  const saveLocal = () => ls.set('tl-hist', hist.slice(0, 200).map(({ plate, ...o }) => o));

  q('#bHist').onclick = () => { drawTarix(); q('#tarix').showModal(); if (user) pullCloud(); };
  ['tFrom', 'tTo', 'tOver'].forEach(i => q('#' + i).addEventListener('change', drawTarix));

  q('#tList').onclick = async e => {
    const b = e.target.closest('.del');
    if (!b) return;
    const i = +b.dataset.i;
    try {
      if (user) { const it = cloud[i]; if (!it) return; await col().doc(it._id).delete(); cloud.splice(i, 1); }
      else { hist.splice(i, 1); saveLocal(); render(); }
    } catch (err) { console.error(err); q('#tCount').textContent = "O'chirib bo'lmadi: " + errText(err); return; }
    drawTarix();
  };

  q('#tClr').onclick = async () => {
    if (!confirm(`Barcha natijalar o'chirilsinmi?${user ? ' (bulutdagilar)' : ''}`)) return;
    try {
      if (user) {
        const s = await col().get();
        for (let k = 0; k < s.docs.length; k += 400) {
          const bt = fb.fs.batch(); s.docs.slice(k, k + 400).forEach(d => bt.delete(d.ref)); await bt.commit();
        }
        cloud = [];
      } else { hist.length = 0; saveLocal(); render(); }
    } catch (err) { console.error(err); q('#tCount').textContent = "O'chirib bo'lmadi: " + errText(err); return; }
    drawTarix();
  };

  q('#tCsv').onclick = () => {
    const rows = filtered();
    if (!rows.length) { q('#tCount').textContent = "CSV uchun natija yo'q."; return; }
    const cell = t => `"${String(t == null ? '' : t).replace(/"/g, '""')}"`;
    const lines = ['vaqt,turi,rang,raqam,yonalish,tezlik_kmh,kadrlar,xato_sm',
      ...rows.map(({ x }) => [when(x), x.type, x.color, x.plate, x.dir, (+x.v).toFixed(1), x.n, (x.rms * 100).toFixed(1)].map(cell).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tezlik-tarix.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
})();
