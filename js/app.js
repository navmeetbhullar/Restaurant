// Shared code for every page: Firebase, login check, data loading, helpers.
// The tab bar is drawn earlier by shell.js, from the role remembered on this phone.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signOut, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local testing only: talk to the Firebase emulator instead of the real project.
const EMULATOR = location.hostname === 'localhost' && location.port === '5055';
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}

/* ---------- making logins for other people ----------
   Creating a login in the browser normally logs you in as that new person.
   Doing it on a second, throwaway connection keeps the admin logged in.
   If the email already has a login (e.g. a checker who was removed) and the
   password matches, that login is reused. Returns the new person's uid. */
export async function createLogin(email, password) {
  const spare = initializeApp(firebaseConfig, 'spare-' + Date.now());
  const spareAuth = initializeAuth(spare, { persistence: inMemoryPersistence });
  if (EMULATOR) connectAuthEmulator(spareAuth, 'http://localhost:9099', { disableWarnings: true });
  try {
    try {
      return (await createUserWithEmailAndPassword(spareAuth, email, password)).user.uid;
    } catch (e) {
      if (e.code !== 'auth/email-already-in-use') throw e;
      try { return (await signInWithEmailAndPassword(spareAuth, email, password)).user.uid; }
      catch { throw e; }
    }
  } finally {
    await signOut(spareAuth).catch(() => {});
  }
}

/* ---------- stock maths (shared with the server) ---------- */
export * from './stock.js';
import { fromIso, fmtNum, autoSatTue } from './stock.js';
export const fmtMult = m => fmtNum(m) + 'x';

/* ---------- dates (always the phone's local day) ---------- */
export function niceDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  return fromIso(s).toLocaleDateString('en-AU', opts);
}

// Short range like "Wed 30 Sep – Fri 2 Oct"
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = s => { const d = fromIso(s); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
export const blockLabel = b => `${shortDate(b.start)} – ${shortDate(b.end)}`;

/* ---------- loading data fast ----------
   saved: the last lists this phone loaded, kept as plain text in localStorage.
   (Firestore's own phone storage could get stuck when pages were switched
   quickly, so it is not used.)
   fresh(load, render): shows the saved copy straight away, then the latest
   copy from the internet. load(true) returns the saved copy or null.
   If the internet copy takes over 12 seconds, a message replaces "Loading…". */
export const saved = {
  get(k) { try { return JSON.parse(localStorage.getItem('c:' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('c:' + k, JSON.stringify(v)); } catch (e) {} },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('c:')).forEach(k => localStorage.removeItem(k)); } catch (e) {} },
};
export const withTimeout = (p, ms = 12000) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);

export async function fresh(load, render) {
  let shown = false;
  try { const d = await load(true); if (d != null) { render(d, true); shown = true; } } catch (e) { console.warn(e); }
  try { render(await withTimeout(load(false)), false); }
  catch (e) {
    console.warn(e);
    if (!shown) document.querySelectorAll('.empty').forEach(el => {
      if (el.textContent.trim() === 'Loading…')
        el.innerHTML = 'Could not load. Check your internet, then <a class="link" href="">try again</a>.';
    });
  }
}

// Items and groups, needed to work out any block's amounts.
export async function loadStock(fromCache = false) {
  if (fromCache) return saved.get('stock');
  const [is, gs] = await Promise.all([getDocs(collection(db, 'items')), getDocs(collection(db, 'groups'))]);
  const items = is.docs.map(d => ({ id: d.id, ...d.data() })).sort(byName);
  const groups = Object.fromEntries(gs.docs.map(d => [d.id, { id: d.id, multiply: 1, dates: [], custom: {}, ...d.data() }]));
  saved.set('stock', { items, groups });
  return { items, groups };
}

/* ---------- Wed–Fri -> Sat–Tue auto-fill ----------
   Typing the Wed–Fri (3-day) amount fills Sat–Tue (4-day) with one more day:
   wedFri / 3 * 4. Once the admin types their own Sat–Tue it is left alone,
   and the "Use +1 day" link puts the suggestion back. */
export function autoPair(aEl, bEl, hintEl, unit) {
  const suggest = () => autoSatTue(aEl.value, unit());
  const mark = () => {
    const isAuto = bEl.dataset.auto === '1';
    if (!hintEl) return;
    hintEl.innerHTML = aEl.value === '' ? 'Type Wed–Fri first. Sat–Tue fills in with one more day.'
      : isAuto ? `Sat–Tue filled in as Wed–Fri + 1 day (${fmtNum(aEl.value)} ÷ 3 × 4). Change it if needed.`
      : `Sat–Tue changed by hand. <button type="button" class="link">Use +1 day (${fmtNum(suggest())})</button>`;
    hintEl.querySelector('button')?.addEventListener('click', () => { bEl.dataset.auto = '1'; fill(); });
  };
  const fill = () => { if (bEl.dataset.auto === '1' && aEl.value !== '') bEl.value = suggest(); mark(); };
  // new or still matching the suggestion -> keep auto-filling
  bEl.dataset.auto = bEl.value === '' || Number(bEl.value) === suggest() ? '1' : '0';
  aEl.addEventListener('input', fill);
  bEl.addEventListener('input', () => { bEl.dataset.auto = '0'; mark(); });
  mark();
  return { refill: fill };
}

/* ---------- small helpers ---------- */
export const $ = sel => document.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
export const param = k => new URLSearchParams(location.search).get(k);
export const refreshUI = () => window.AppleUI?.refresh();
export const CHEV = '<div class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></div>';

/* ---------- login ----------
   The role is remembered on this phone ("me") so pages open instantly.
   start() uses it at once, and checks with Firebase in the background:
   logged out, role changed or removed -> the page reloads or goes to login.
   Nothing is unsafe about this: the database rules check every read and write. */
const hang = () => new Promise(() => {});
let authResolve;
export const authReady = new Promise(r => { authResolve = r; });
const stopAuth = onAuthStateChanged(auth, u => { stopAuth(); authResolve(u); });

export function remember(me) { try { localStorage.setItem('me', JSON.stringify(me)); } catch (e) {} }
export function forget() { try { localStorage.removeItem('me'); } catch (e) {} saved.clear(); }

// Reads the person's role and remembers it. Returns null if they have no access.
export async function loadMe(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  const p = snap.exists() ? snap.data() : null;
  if (!p || !['admin', 'checker'].includes(p.role)) return null;
  const me = { uid: user.uid, email: user.email, name: p.name || '', role: p.role };
  remember(me);
  return me;
}

export function start({ adminOnly = false } = {}) {
  const me = window.__me;
  const check = authReady.then(async user => {
    if (!user || (me && me.uid !== user.uid)) { forget(); location.replace('index.html'); return hang(); }
    let fresh;
    try { fresh = await loadMe(user); }
    catch (e) { console.warn('offline, using saved login', e); return; }
    if (!fresh) { forget(); await signOut(auth); location.replace('index.html?norole=1'); return hang(); }
    if (!me || me.role !== fresh.role || me.name !== fresh.name) { location.reload(); return hang(); }
  });
  if (!me) return check.then(hang);            // first visit on this phone: reloads once
  if (adminOnly && me.role !== 'admin') { location.replace('today.html'); return hang(); }
  document.querySelector('.page')?.classList.remove('wait');
  return Promise.resolve({ user: { uid: me.uid, email: me.email }, profile: me, isAdmin: me.role === 'admin' });
}

/* ---------- talking to our server (Vercel functions in /api) ----------
   Sends the logged-in person's Firebase pass so the server knows who asked. */
export async function api(path, body) {
  const token = await (await authReady)?.getIdToken();
  const res = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw Object.assign(new Error(data.error || 'Server error ' + res.status), { status: res.status, data });
  return data;
}

export async function logOut() {
  forget();
  await signOut(auth);
  location.replace('index.html');
}
