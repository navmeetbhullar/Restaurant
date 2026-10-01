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
   Items:  { name, unit, wedFri, satTue, onlyFor? }
     wedFri = how much for the 3-day Wed–Fri block,
     satTue = how much for the 4-day Sat–Tue block (filled in as wedFri plus one
              more day, wedFri / 3 * 4, and the admin can change it).
     onlyFor = a group id, for items only needed during that festival.
   Groups: { name, multiply, dates: ["2026-11-08", ...], custom: { itemId: ... } }
     multiply applies to every item on the group's days, unless custom says:
       { multiply: 1.5 }               this item's own multiplier
       { wedFri: 10, satTue: 13.33 }   an exact amount for a block of festival days
   A block is worked out day by day. Each day gets its share of the block
   amount (amount / days). Festival days get their group's share instead.
   So Diwali (2x) on only the Friday of Wed–Fri gives 1 + 1 + 2 = 4 shares
   of 3, i.e. 1⅓ times the normal amount. */
export const amountFor = (x, type) => Number(type === 'A' ? x.wedFri : x.satTue) || 0;
export const autoSatTue = (wedFri, unit) => tidy((Number(wedFri) || 0) / 3 * 4, unit);

// { "2026-11-08": group, ... } from the dates stored inside each group
export function dayGroups(groups) {
  const out = {};
  for (const g of Object.values(groups)) for (const d of g.dates || []) out[d] = g;
  return out;
}

// One day's share of an item, on a day using group g (or a normal day).
function share(item, g, type, n) {
  if (item.onlyFor) return g?.id === item.onlyFor ? amountFor(item, type) / n : 0;
  const base = amountFor(item, type) / n;
  if (!g) return base;
  const c = g.custom?.[item.id];
  if (c?.multiply != null) return base * (Number(c.multiply) || 0);
  if (c?.wedFri != null || c?.satTue != null) return amountFor(c, type) / n;
  return base * (Number(g.multiply) || 1);
}

// items: [{id, ...}]  groups: {id: group}. Returns items needed in the block, each with .need
export function blockTargets(items, groups, block) {
  const byDay = dayGroups(groups);
  const n = block.days.length;
  return items
    .filter(i => !i.onlyFor || block.days.some(d => byDay[d]?.id === i.onlyFor))
    .map(i => ({ ...i, need: tidy(block.days.reduce((t, d) => t + share(i, byDay[d], block.type, n), 0), i.unit) }));
}

// Festival days in a block: [{ day, group }]
export function blockFestivals(groups, block) {
  const byDay = dayGroups(groups);
  return block.days.filter(d => byDay[d]).map(d => ({ day: d, group: byDay[d] }));
}

// Readable document names, e.g. "Basmati rice" -> "basmati-rice"
export function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}
export function uniqueId(name, taken) {
  const base = slugify(name);
  let id = base, i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  return id;
}
