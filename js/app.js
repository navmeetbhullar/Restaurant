// Shared code for every page: Firebase, login check, tab bar, helpers.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, connectFirestoreEmulator }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local testing only: talk to the Firebase emulator instead of the real project.
if (location.hostname === 'localhost' && location.port === '5055') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}

/* ---------- units ---------- */
export const UNITS = ['kg', 'g', 'litres', 'ml', 'pieces', 'packets', 'boxes', 'bottles', 'cans', 'bags', 'trays', 'dozen'];
// Units you can only have whole numbers of. Amounts in these round up.
const WHOLE = new Set(['pieces', 'packets', 'boxes', 'bottles', 'cans', 'bags', 'trays']);

/* ---------- ideal amounts ----------
   group = null means Normal. A group can have its own rule per item:
   { mode: 'x', value: 2.5 } multiplies, { mode: 'amt', value: 40 } is an exact amount.
   Items with no rule use the group's multiplier. */
export function idealFor(item, group) {
  if (!group) return tidy(item.ideal, item.unit);
  const r = group.rules?.[item.id];
  if (r?.mode === 'amt') return tidy(r.value, item.unit);
  const m = r?.mode === 'x' ? r.value : (group.multiplier ?? 1);
  return tidy(item.ideal * m, item.unit);
}
function tidy(v, unit) {
  v = Number(v) || 0;
  if (WHOLE.has(unit)) return Math.ceil(v - 1e-9);
  return Math.round(v * 100) / 100;
}
export const fmtNum = v => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
export const fmtMult = m => fmtNum(m) + 'x';

/* ---------- dates (always the phone's local day) ---------- */
export function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fromIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function niceDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  return fromIso(s).toLocaleDateString(undefined, opts);
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

export async function logOut() {
  await signOut(auth);
  location.replace('index.html');
}
