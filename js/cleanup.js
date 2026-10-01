// One-time tidy-up: removes data saved in the first version's layout
// (dates, reminders and tokens collections, and items, groups, checks and
// invoices in the old format). Real data in the new layout is never touched.
// Safe to delete this file, its button and the old-collection rules later.
import { db } from './app.js';
import { collection, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const OLD_COLLECTIONS = ['dates', 'reminders', 'tokens'];
const isOld = {
  items: d => d.wedFri == null,
  groups: d => d.multiply == null || d.dates == null,
  checks: d => d.counts != null || d.lines != null,
  invoices: d => d.dataUrl !== undefined,
};

export async function findOld() {
  const refs = [];
  await Promise.all([
    ...OLD_COLLECTIONS.map(async n => (await getDocs(collection(db, n))).docs.forEach(d => refs.push(d.ref))),
    ...Object.entries(isOld).map(async ([n, test]) =>
      (await getDocs(collection(db, n))).docs.filter(d => test(d.data())).forEach(d => refs.push(d.ref))),
  ]);
  return refs;
}

export async function cleanOld() {
  const refs = await findOld();
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
  return refs.length;
}
