// Stock maths shared by the app and the server (reminders).
// No Firebase in here, just plain rules and numbers.

/* ---------- units ---------- */
export const UNITS = ['kg', 'g', 'litres', 'ml', 'pieces', 'packets', 'boxes', 'bottles', 'cans', 'bags', 'trays', 'dozen'];
// Units you can only have whole numbers of. Amounts in these round up.
const WHOLE = new Set(['pieces', 'packets', 'boxes', 'bottles', 'cans', 'bags', 'trays']);

// Smallest step the dial moves in, and what order amounts round up to.
export function stepOf(unit) {
  if (unit === 'kg' || unit === 'litres') return 0.05;
  if (unit === 'g' || unit === 'ml') return 10;
  if (unit === 'dozen') return 0.25;
  if (WHOLE.has(unit)) return 1;
  return 0.05;
}
const roundUp = (v, s) => Math.round(Math.ceil(v / s - 1e-9) * s * 1000) / 1000;
export function tidy(v, unit) {
  v = Number(v) || 0;
  if (WHOLE.has(unit)) return Math.ceil(v - 1e-9);
  return Math.round(v * 100) / 100;
}
// Order amounts round up to sensible buying sizes (counting stays fine).
export function orderStepOf(unit) {
  if (unit === 'kg' || unit === 'litres' || unit === 'dozen') return 0.5;
  if (unit === 'g' || unit === 'ml') return 100;
  return WHOLE.has(unit) ? 1 : 0.5;
}
// How much to buy so the store reaches the target.
export function toOrder(target, have, unit) {
  const need = (Number(target) || 0) - (Number(have) || 0);
  return need <= 1e-9 ? 0 : roundUp(need, orderStepOf(unit));
}
export const fmtNum = v => (Math.round((Number(v) || 0) * 100) / 100)
  .toLocaleString('en-AU', { maximumFractionDigits: 2 });

/* ---------- dates ---------- */
export function isoDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fromIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoDate(d); }

/* ---------- blocks ----------
   The week is split in two, each starting with a stock check:
     A = Wed, Thu, Fri        (check on Wed)
     B = Sat, Sun, Mon, Tue   (check on Sat or Sun)
   A block is named by its first day, e.g. "2026-09-30". */
export const BLOCK_DAYS = { A: 3, B: 4 };
export const BLOCK_NAME = { A: 'Wed–Fri', B: 'Sat–Tue' };
export function blockOf(iso) {
  const dow = fromIso(iso).getDay();                 // 0 = Sunday
  const type = dow >= 3 && dow <= 5 ? 'A' : 'B';
  const back = type === 'A' ? dow - 3 : (dow + 1) % 7;  // days since the block started
  const start = addDays(iso, -back);
  const days = Array.from({ length: BLOCK_DAYS[type] }, (_, i) => addDays(start, i));
  return { start, type, days, end: days[days.length - 1], dayIndex: back };
}
export const nextBlock = b => blockOf(addDays(b.end, 1));
export const prevBlock = b => blockOf(addDays(b.start, -1));

/* ---------- amounts ----------
   Each item has a normal amount for each block: a (Wed–Fri) and b (Sat–Tue).
   One day's worth = block amount / days in the block.
   A festival day adds extra on top. By default every item gets the group's
   extra days (e.g. +1 day). An item can have its own rule:
     { mode: 'days', value: 2 }  -> +2 days of that item
     { mode: 'amt',  value: 5 }  -> +5 (in the item's unit)
   Items made "just for a group" (item.only = groupId) only appear in blocks
   that include that group's days, and only use their 'amt' rule. */
export const blockAmount = (item, type) =>
  Number(type === 'A' ? (item.a ?? item.ideal) : (item.b ?? item.ideal)) || 0;
export const extraDaysOf = g =>
  g.extraDays ?? (g.multiplier != null ? Math.max(0, g.multiplier - 1) : 1);

export function festivalExtra(item, group, perDay) {
  const r = group.rules?.[item.id];
  if (r?.mode === 'amt') return Number(r.value) || 0;
  if (item.only) return 0;
  const d = r?.mode === 'days' ? Number(r.value) || 0 : extraDaysOf(group);
  return d * perDay;
}

// items: [{id, name, unit, a, b, only?}]  groups: {id: group}  dateGroups: {iso: groupId}
// Returns the items needed in this block, each with .target.
export function blockTargets(items, groups, dateGroups, block) {
  const fest = block.days.map(d => groups[dateGroups[d]]).filter(Boolean);
  return items
    .filter(i => !i.only || fest.some(g => g.id === i.only))
    .map(i => {
      const base = i.only ? 0 : blockAmount(i, block.type);
      const perDay = base / block.days.length;
      let t = base;
      for (const g of fest) if (!i.only || g.id === i.only) t += festivalExtra(i, g, perDay);
      return { ...i, target: tidy(t, i.unit) };
    });
}

// Festival days in a block, e.g. [{ day, group }]
export function blockFestivals(groups, dateGroups, block) {
  return block.days.filter(d => groups[dateGroups[d]]).map(d => ({ day: d, group: groups[dateGroups[d]] }));
}
