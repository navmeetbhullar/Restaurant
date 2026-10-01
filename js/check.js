// Loading a block's stock check and working out its lines.
import { db, loadStock, blockTargets, blockFestivals, toOrder, byName } from './app.js';
import { doc, getDoc, getDocFromCache } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// Returns { check, lines, fest, stock }, or null when fromCache and nothing is saved.
// lines: [{ id, name, unit, need, counted, buy }]
// Once a check is submitted its amounts are frozen inside it, so later changes
// to items or groups never rewrite an old report.
export async function blockData(block, fromCache = false) {
  const ref = doc(db, 'checks', block.start);
  const [snap, stock] = await Promise.all([
    fromCache ? getDocFromCache(ref).catch(() => null) : getDoc(ref),
    loadStock(fromCache),
  ]);
  if (!stock) return null;
  const check = snap?.exists() ? snap.data() : null;
  const fest = blockFestivals(stock.groups, block);
  const saved = check?.items || {};
  const lines = check?.status === 'submitted'
    ? Object.entries(saved).map(([id, l]) => ({ id, name: l.name, unit: l.unit, need: l.need, counted: l.counted })).sort(byName)
    : blockTargets(stock.items, stock.groups, block)
        .map(i => ({ id: i.id, name: i.name, unit: i.unit, need: i.need, counted: saved[i.id]?.counted }));
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
