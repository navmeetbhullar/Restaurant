// Runs every day around midday Sydney time (see vercel.json "crons").
// On the first two days of a block (Wed, Thu / Sat, Sun), if the stock
// check is not submitted yet, every checker gets a reminder.
import { handler, send, fb, pushTo, uidsWithRole, sydneyNow, httpError } from './_lib.js';
import { blockOf } from '../js/stock.js';

export default handler(async (req, res) => {
  // Vercel sends the CRON_SECRET with its own calls, so strangers cannot trigger this.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) throw httpError(401, 'Not allowed');

  let { iso, hour } = sydneyNow();
  const url = new URL(req.url, 'http://x');
  if (process.env.FIRESTORE_EMULATOR_HOST && url.searchParams.get('date')) {   // local testing only
    iso = url.searchParams.get('date'); hour = Number(url.searchParams.get('hour') ?? 12);
  }
  // two cron times cover summer and winter time; only the one landing on 12 o'clock acts
  if (hour !== 12) return send(res, 200, { skipped: `It is ${hour}:00 in Sydney, not midday` });

  const block = blockOf(iso);
  if (block.dayIndex > 1) return send(res, 200, { skipped: 'Not the first or second day of a block' });

  const { db } = fb();
  const check = (await db.doc('checks/' + block.start).get()).data();
  if (check?.status === 'submitted') return send(res, 200, { skipped: 'Check already done' });

  const flag = db.doc('reminders/check-' + iso);
  try { await flag.create({ at: new Date() }); } catch { return send(res, 200, { skipped: 'Already reminded today' }); }

  const counted = Object.keys(check?.counts || {}).length;
  const r = await pushTo(await uidsWithRole('checker'), {
    title: block.dayIndex === 0 ? 'Stock check today' : 'Stock check not done yet',
    body: counted
      ? `The stock check is started (${counted} counted). Please finish and submit it.`
      : 'Please count the store and submit the stock check.',
    url: '/today.html',
    tag: 'check',
  });
  send(res, 200, { date: iso, block: block.start, ...r });
}, { get: true });
