// Sample data for trying the app out. Everything added here is tagged
// sample: true, so removeSample() deletes exactly this and nothing real.
// Remove this file (and its buttons in account.html) before handing over.
import { db, isoDate } from './app.js';
import { collection, doc, getDocs, query, where, writeBatch, deleteField }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const ITEMS = [
  ['Onions', 'kg', 20], ['Tomatoes', 'kg', 15], ['Potatoes', 'kg', 25],
  ['Garlic', 'kg', 3], ['Ginger', 'kg', 3], ['Coriander', 'kg', 2],
  ['Basmati rice', 'kg', 30], ['Atta', 'kg', 25], ['Paneer', 'kg', 5],
  ['Chicken', 'kg', 12], ['Yogurt', 'kg', 10], ['Ghee', 'kg', 4],
  ['Milk', 'litres', 20], ['Cream', 'litres', 5], ['Cooking oil', 'litres', 15],
  ['Eggs', 'trays', 4], ['Garam masala', 'packets', 6], ['Coke', 'cans', 48],
  ['Takeaway boxes', 'pieces', 200],
];

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
  ITEMS.forEach(([name, unit, ideal]) => {
    const ref = doc(collection(db, 'items'));
    ids[name] = ref.id;
    batch.set(ref, { name, unit, ideal, sample: true });
  });

  const today = isoDate();
  const groups = [
    { name: 'Party booking', multiplier: 1.5, rules: {
        [ids['Takeaway boxes']]: { mode: 'amt', value: 400 } },
      days: [today] },
    { name: 'Navratri', multiplier: 1.5, rules: {
        [ids['Chicken']]: { mode: 'x', value: 0.5 },
        [ids['Eggs']]: { mode: 'x', value: 0.5 },
        [ids['Paneer']]: { mode: 'x', value: 2.5 } },
      days: range('2026-10-11', '2026-10-19') },
    { name: 'Diwali', multiplier: 2, rules: {
        [ids['Ghee']]: { mode: 'amt', value: 12 },
        [ids['Paneer']]: { mode: 'x', value: 3 },
        [ids['Milk']]: { mode: 'x', value: 2.5 } },
      days: range('2026-11-07', '2026-11-09') },
  ];

  // never take over a date that already has a real group
  const taken = new Set((await getDocs(collection(db, 'dates'))).docs.map(d => d.id));
  groups.forEach(({ days, ...g }) => {
    const ref = doc(collection(db, 'groups'));
    batch.set(ref, { ...g, sample: true });
    days.filter(d => !taken.has(d)).forEach(d => batch.set(doc(db, 'dates', d), { group: ref.id, sample: true }));
  });
  await batch.commit();
}

export async function removeSample() {
  const [items, groups, dates] = await Promise.all(['items', 'groups', 'dates'].map(n => getDocs(sampleOnly(n))));
  const batch = writeBatch(db);
  [items, groups, dates].forEach(s => s.docs.forEach(d => batch.delete(d.ref)));
  // real groups may have per-item settings for sample items; clear those too
  const gone = new Set(items.docs.map(d => d.id));
  (await getDocs(collection(db, 'groups'))).docs.forEach(g => {
    if (g.data().sample) return;
    const stale = Object.keys(g.data().rules || {}).filter(k => gone.has(k));
    if (stale.length) batch.update(g.ref, Object.fromEntries(stale.map(k => ['rules.' + k, deleteField()])));
  });
  await batch.commit();
  return items.size + groups.size + dates.size;
}
