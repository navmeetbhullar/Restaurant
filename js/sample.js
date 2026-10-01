// Sample data for trying the app out. Everything added here is tagged
// sample: true, so removeSample() deletes exactly this and nothing real.
// Remove this file (and its buttons in account.html) before handing over.
import { db, isoDate, uniqueId, autoSatTue } from './app.js';
import { collection, doc, getDocs, query, where, writeBatch, deleteField }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// name, unit, Wed–Fri amount (Sat–Tue = one more day, like the app suggests)
const ITEMS = [
  ['Onions', 'kg', 15], ['Tomatoes', 'kg', 12], ['Potatoes', 'kg', 20],
  ['Garlic', 'kg', 2], ['Ginger', 'kg', 2], ['Coriander', 'kg', 1.5],
  ['Basmati rice', 'kg', 25], ['Atta', 'kg', 20], ['Paneer', 'kg', 4],
  ['Chicken', 'kg', 10], ['Yogurt', 'kg', 8], ['Ghee', 'kg', 3],
  ['Milk', 'litres', 15], ['Cream', 'litres', 4], ['Cooking oil', 'litres', 12],
  ['Eggs', 'trays', 3], ['Garam masala', 'packets', 4], ['Coke', 'cans', 36],
  ['Takeaway boxes', 'pieces', 150],
];
// Diwali-only items: name, unit, Wed–Fri amount for a block of Diwali days
const DIWALI_ONLY = [['Diyas', 'pieces', 300], ['Sweet boxes', 'boxes', 90]];

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
  const [is, gs] = await Promise.all([getDocs(collection(db, 'items')), getDocs(collection(db, 'groups'))]);
  const itemIds = new Set(is.docs.map(d => d.id)), groupIds = new Set(gs.docs.map(d => d.id));
  const usedDays = new Set(gs.docs.flatMap(d => d.data().dates || []));   // never take a real group's day
  const batch = writeBatch(db);
  const ids = {};
  const addItem = (name, unit, wedFri, extra = {}) => {
    const id = uniqueId(name, itemIds); itemIds.add(id); ids[name] = id;
    batch.set(doc(db, 'items', id), { name, unit, wedFri, satTue: autoSatTue(wedFri, unit), ...extra, sample: true });
  };
  ITEMS.forEach(([n, u, a]) => addItem(n, u, a));

  const gid = name => { const id = uniqueId(name, groupIds); groupIds.add(id); return id; };
  const diwali = gid('Diwali');
  DIWALI_ONLY.forEach(([n, u, a]) => addItem(n, u, a, { onlyFor: diwali }));
  const c = (name, v) => ({ [ids[name]]: { name, ...v } });

  const groups = [
    [gid('Party booking'), { name: 'Party booking', multiply: 1.5, dates: [isoDate()],
      custom: c('Takeaway boxes', { wedFri: 250, satTue: 333 }) }],
    [gid('Navratri'), { name: 'Navratri', multiply: 1.5, dates: range('2026-10-11', '2026-10-19'),
      custom: { ...c('Chicken', { multiply: 0.5 }), ...c('Eggs', { multiply: 0.5 }), ...c('Paneer', { multiply: 2.5 }) } }],
    [diwali, { name: 'Diwali', multiply: 2, dates: range('2026-11-07', '2026-11-09'),
      custom: { ...c('Ghee', { wedFri: 9, satTue: 12 }), ...c('Paneer', { multiply: 3 }) } }],
  ];
  for (const [id, g] of groups) {
    g.dates = g.dates.filter(d => !usedDays.has(d));
    g.dates.forEach(d => usedDays.add(d));
    batch.set(doc(db, 'groups', id), { ...g, sample: true });
  }
  await batch.commit();
}

export async function removeSample() {
  const [items, groups] = await Promise.all(['items', 'groups'].map(n => getDocs(sampleOnly(n))));
  const batch = writeBatch(db);
  [items, groups].forEach(s => s.docs.forEach(d => batch.delete(d.ref)));
  const gone = new Set(items.docs.map(d => d.id));
  // test stock checks that counted sample items go too, with their invoices
  const checks = (await getDocs(collection(db, 'checks'))).docs
    .filter(c => Object.keys(c.data().items || {}).some(k => gone.has(k)));
  checks.forEach(c => { batch.delete(c.ref); batch.delete(doc(db, 'invoices', c.id)); });
  // real groups may have settings for sample items; clear those too
  (await getDocs(collection(db, 'groups'))).docs.forEach(g => {
    if (g.data().sample) return;
    const stale = Object.keys(g.data().custom || {}).filter(k => gone.has(k));
    if (stale.length) batch.update(g.ref, Object.fromEntries(stale.map(k => ['custom.' + k, deleteField()])));
  });
  await batch.commit();
  return items.size + groups.size + checks.length;
}
