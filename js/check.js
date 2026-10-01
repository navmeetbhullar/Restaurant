// Loading a block's stock check and working out its lines.
import { db, loadStock, saved, blockTargets, blockFestivals, toOrder, byName } from './app.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Returns { check, lines, fest, stock }, or null when fromCache and nothing is saved.
// lines: [{ id, name, unit, need, counted, buy }]
// Once a check is submitted its amounts are frozen inside it, so later changes
// to items or groups never rewrite an old report.
export async function blockData(block, fromCache = false) {
  let check, stock;
  if (fromCache) {
    stock = saved.get('stock');
    if (!stock) return null;
    check = saved.get('check:' + block.start);
  } else {
    const [snap, s] = await Promise.all([getDoc(doc(db, 'checks', block.start)), loadStock(false)]);
    check = snap.exists() ? snap.data() : null;
    stock = s;
    saved.set('check:' + block.start, check);
  }
  const fest = blockFestivals(stock.groups, block);
  const counted = check?.items || {};
  const lines = check?.status === 'submitted'
    ? Object.entries(counted).map(([id, l]) => ({ id, name: l.name, unit: l.unit, need: l.need, counted: l.counted })).sort(byName)
    : blockTargets(stock.items, stock.groups, block)
        .map(i => ({ id: i.id, name: i.name, unit: i.unit, need: i.need, counted: counted[i.id]?.counted }));
  for (const l of lines) l.buy = l.counted == null ? null : toOrder(l.need, l.counted, l.unit);
  return { check, lines, fest, stock };
}

// "Diwali on Fri" for a block's festival days
export function festNote(fest) {
  const by = {};
  for (const f of fest) (by[f.group.name] ||= []).push(f.day);
  return Object.entries(by).map(([n, days]) =>
    `${n} on ${days.map(d => new Date(d + 'T12:00').toLocaleDateString('en-AU', { weekday: 'short' })).join(', ')}`).join(' · ');
}
