// Shared code for every page: Firebase, login check, tab bar, helpers.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signOut, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, query, where, documentId, connectFirestoreEmulator }
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
import { fromIso, extraDaysOf, fmtNum } from './stock.js';
export const fmtExtra = g => {
  const d = extraDaysOf(g);
  return d === 0 ? 'Normal' : `+${fmtNum(d)} day${d === 1 ? '' : 's'}`;
};

/* ---------- dates (always the phone's local day) ---------- */
export function niceDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  return fromIso(s).toLocaleDateString('en-AU', opts);
}

// Short range like "Wed 30 Sep – Fri 2 Oct"
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = s => { const d = fromIso(s); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
export const blockLabel = b => `${shortDate(b.start)} – ${shortDate(b.end)}`;

/* ---------- loading stock data ----------
   Everything needed to work out a block's amounts, in one go. */
export async function loadStock(block) {
  const [is, gs, ds] = await Promise.all([
    getDocs(collection(db, 'items')),
    getDocs(collection(db, 'groups')),
    block ? getDocs(query(collection(db, 'dates'),
      where(documentId(), '>=', block.start), where(documentId(), '<=', block.end))) : null,
  ]);
  const items = is.docs.map(d => ({ id: d.id, ...d.data() })).sort(byName);
  const groups = Object.fromEntries(gs.docs.map(d => [d.id, { id: d.id, rules: {}, ...d.data() }]));
  const dateGroups = ds ? Object.fromEntries(ds.docs.map(d => [d.id, d.data().group])) : {};
  return { items, groups, dateGroups };
}

/* ---------- small helpers ---------- */
export const $ = sel => document.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
export const param = k => new URLSearchParams(location.search).get(k);
export const refreshUI = () => window.AppleUI?.refresh();
export const CHEV = '<div class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></div>';

/* ---------- tab bar ---------- */
const ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  items: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
  groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.3 5.6.6-4.2 3.9 1.2 5.7L12 15.7 6.9 18.5l1.2-5.7L4 8.9l5.6-.6z"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>',
};
const TABS = {
  admin: [['today', 'Today', 'today.html'], ['items', 'Items', 'items.html'],
          ['groups', 'Groups', 'groups.html'], ['account', 'Account', 'account.html']],
  checker: [['today', 'Today', 'today.html'], ['account', 'Account', 'account.html']],
};

function tabBar(role, current) {
  const tabs = TABS[role];
  const html = `
<div class="scrim"></div>
<div class="dock">
  <nav class="bar" id="bar">
    <div class="bar__glass"></div>
    <div class="bar__sheen"></div>
    <svg class="bar__edge" id="edge" preserveAspectRatio="none">
      <defs><linearGradient id="rimgrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0"    stop-color="var(--rim-hot)"/>
        <stop offset="0.26" stop-color="var(--rim-cool)"/>
        <stop offset="0.49" stop-color="transparent"/>
        <stop offset="0.73" stop-color="var(--rim-cool)"/>
        <stop offset="1"    stop-color="var(--rim-hot)"/>
      </linearGradient></defs>
      <path id="edgePath" stroke="url(#rimgrad)"/>
    </svg>
    <div class="tabs" id="tabs">
      <div class="lens" id="lens" style="width:${100 / tabs.length}%"></div>
      ${tabs.map(([k, t]) => `<button class="tab${k === current ? ' on' : ''}">${ICONS[k]}<span class="t">${t}</span></button>`).join('')}
    </div>
  </nav>
</div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('bar').addEventListener('tabchange', e => {
    location.href = tabs[e.detail.index][2];
  });
}

function loadKit() {
  return new Promise(res => {
    const s = document.createElement('script');
    s.src = 'apple-ui/apple-ui.js';
    s.onload = res;
    document.body.appendChild(s);
  });
}

/* ---------- login check ----------
   Every page except the login page calls start(). It waits for Firebase to
   say who is logged in, reads their role, then draws the tab bar.
   Not logged in -> login page. Checker on an admin page -> Today. */
export function start({ tab, adminOnly = false } = {}) {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (!user) return location.replace('index.html');
      let profile = null;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        profile = snap.exists() ? snap.data() : null;
      } catch (e) { console.error(e); }
      if (!profile || !['admin', 'checker'].includes(profile.role)) {
        await signOut(auth);
        return location.replace('index.html?norole=1');
      }
      if (adminOnly && profile.role !== 'admin') return location.replace('today.html');
      tabBar(profile.role, tab);
      await loadKit();
      document.querySelector('.page')?.classList.remove('wait');
      resolve({ user, profile, isAdmin: profile.role === 'admin' });
    });
  });
}

/* ---------- talking to our server (Vercel functions in /api) ----------
   Sends the logged-in person's Firebase pass so the server knows who asked. */
export async function api(path, body) {
  const token = await auth.currentUser?.getIdToken();
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
  await signOut(auth);
  location.replace('index.html');
}
