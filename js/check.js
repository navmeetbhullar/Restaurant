// Loading a block's stock check and working out its lines.
import { db, loadStock, blockTargets, blockFestivals, toOrder, byName } from './app.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Returns { check, lines, fest, stock }.
// lines: [{ id, name, unit, target, have, order }]
// Once a check is submitted its amounts are frozen, so later changes to
// items or groups never rewrite an old report.
export async function blockData(block) {
  const [snap, stock] = await Promise.all([getDoc(doc(db, 'checks', block.start)), loadStock(block)]);
  const check = snap.exists() ? snap.data() : null;
  const fest = blockFestivals(stock.groups, stock.dateGroups, block);
  const lines = check?.status === 'submitted' && check.lines
    ? Object.entries(check.lines).map(([id, l]) => ({ id, ...l })).sort(byName)
    : blockTargets(stock.items, stock.groups, stock.dateGroups, block)
        .map(i => ({ id: i.id, name: i.name, unit: i.unit, target: i.target }));
  const counts = check?.counts || {};
  for (const l of lines) {
    l.have = counts[l.id];
    l.order = l.have == null ? null : toOrder(l.target, l.have, l.unit);
  }
  return { check, lines, fest, stock };
}

// "Diwali on Sat, Sun" for a block's festival days
export function festNote(fest) {
  const by = {};
  for (const f of fest) (by[f.group.name] ||= []).push(f.day);
  return Object.entries(by).map(([n, days]) =>
    `${n} on ${days.map(d => new Date(d + 'T12:00').toLocaleDateString('en-AU', { weekday: 'short' })).join(', ')}`).join(' · ');
}
