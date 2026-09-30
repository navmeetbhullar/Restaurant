// Sample data for trying the app out. Everything added here is tagged
// sample: true, so removeSample() deletes exactly this and nothing real.
// Remove this file (and its buttons in account.html) before handing over.
import { db, isoDate } from './app.js';
import { collection, doc, getDocs, query, where, writeBatch, deleteField }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// name, unit, Wed–Fri amount, Sat–Tue amount
const ITEMS = [
  ['Onions', 'kg', 15, 25], ['Tomatoes', 'kg', 12, 18], ['Potatoes', 'kg', 20, 30],
  ['Garlic', 'kg', 2, 3], ['Ginger', 'kg', 2, 3], ['Coriander', 'kg', 1.5, 2.5],
  ['Basmati rice', 'kg', 25, 40], ['Atta', 'kg', 20, 30], ['Paneer', 'kg', 4, 7],
  ['Chicken', 'kg', 10, 16], ['Yogurt', 'kg', 8, 12], ['Ghee', 'kg', 3, 5],
  ['Milk', 'litres', 15, 25], ['Cream', 'litres', 4, 6], ['Cooking oil', 'litres', 12, 18],
  ['Eggs', 'trays', 3, 5], ['Garam masala', 'packets', 4, 6], ['Coke', 'cans', 36, 60],
  ['Takeaway boxes', 'pieces', 150, 250],
];
// festival-only items: name, unit, amount per festival day
const DIWALI_ONLY = [['Diyas', 'pieces', 100], ['Sweet boxes', 'boxes', 30]];

const sampleOnly = name => query(collection(db, name), where('sample', '==', true));

export async function hasSample() {
  return !(await getDocs(sampleOnly('items'))).empty;
}

function range(from, to) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  for (let x = new Date(y, m - 1, d); isoDate(x) <= to; x.setDate(x.getDate() + 1)) out.push(isoDate(x));
  return out;
}

export async function addSample() {
  if (await hasSample()) throw new Error('already');
  const batch = writeBatch(db);
  const ids = {};
  ITEMS.forEach(([name, unit, a, b]) => {
    const ref = doc(collection(db, 'items'));
    ids[name] = ref.id;
    batch.set(ref, { name, unit, a, b, sample: true });
  });

  const today = isoDate();
  const refs = { party: doc(collection(db, 'groups')), nav: doc(collection(db, 'groups')), diwali: doc(collection(db, 'groups')) };
  const diwaliRules = {
    [ids['Ghee']]: { mode: 'amt', value: 3 },
    [ids['Paneer']]: { mode: 'days', value: 2 },
    [ids['Milk']]: { mode: 'days', value: 1.5 },
  };
  DIWALI_ONLY.forEach(([name, unit, per]) => {
    const ref = doc(collection(db, 'items'));
    batch.set(ref, { name, unit, a: 0, b: 0, only: refs.diwali.id, sample: true });
    diwaliRules[ref.id] = { mode: 'amt', value: per };
  });
  const groups = [
    { ref: refs.party, name: 'Party booking', extraDays: 0.5, rules: {
        [ids['Takeaway boxes']]: { mode: 'amt', value: 120 } },
      days: [today] },
    { ref: refs.nav, name: 'Navratri', extraDays: 0.5, rules: {
        [ids['Chicken']]: { mode: 'days', value: 0 },
        [ids['Eggs']]: { mode: 'days', value: 0 },
        [ids['Paneer']]: { mode: 'days', value: 2 } },
      days: range('2026-10-11', '2026-10-19') },
    { ref: refs.diwali, name: 'Diwali', extraDays: 1, rules: diwaliRules,
      days: range('2026-11-07', '2026-11-09') },
  ];

  // never take over a date that already has a real group
  const taken = new Set((await getDocs(collection(db, 'dates'))).docs.map(d => d.id));
  groups.forEach(({ ref, days, ...g }) => {
    batch.set(ref, { ...g, sample: true });
    days.filter(d => !taken.has(d)).forEach(d => batch.set(doc(db, 'dates', d), { group: ref.id, sample: true }));
  });
  await batch.commit();
}

export async function removeSample() {
  const [items, groups, dates] = await Promise.all(['items', 'groups', 'dates'].map(n => getDocs(sampleOnly(n))));
  const batch = writeBatch(db);
  [items, groups, dates].forEach(s => s.docs.forEach(d => batch.delete(d.ref)));
  const gone = new Set(items.docs.map(d => d.id));
  // test stock checks that counted sample items go too, with their invoices
  const checks = (await getDocs(collection(db, 'checks'))).docs
    .filter(c => Object.keys(c.data().counts || {}).some(k => gone.has(k)));
  checks.forEach(c => { batch.delete(c.ref); batch.delete(doc(db, 'invoices', c.id)); });
  // real groups may have per-item settings for sample items; clear those too
  (await getDocs(collection(db, 'groups'))).docs.forEach(g => {
    if (g.data().sample) return;
    const stale = Object.keys(g.data().rules || {}).filter(k => gone.has(k));
    if (stale.length) batch.update(g.ref, Object.fromEntries(stale.map(k => ['rules.' + k, deleteField()])));
  });
  await batch.commit();
  return items.size + groups.size + dates.size + checks.length;
}
