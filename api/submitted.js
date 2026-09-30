// A checker submitted the stock check: tell the admins the report is ready.
import { handler, who, send, fb, pushTo, uidsWithRole, httpError } from './_lib.js';
import { toOrder } from '../js/stock.js';

export default handler(async (req, res) => {
  await who(req);
  const block = String(req.body?.block || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(block)) throw httpError(400, 'Bad block');
  const { db } = fb();
  const check = (await db.doc('checks/' + block).get()).data();
  if (check?.status !== 'submitted') throw httpError(409, 'Check is not submitted');

  // send once per block, even if the button is pressed twice
  const flag = db.doc('reminders/report-' + block);
  try { await flag.create({ at: new Date() }); } catch { return send(res, 200, { sent: 0, already: true }); }

  const lines = check.lines || {};
  const short = Object.entries(lines).filter(([id, l]) => toOrder(l.target, check.counts?.[id], l.unit) > 0).length;
  const r = await pushTo(await uidsWithRole('admin'), {
    title: 'Stock report ready',
    body: `${check.byName || 'A checker'} finished the stock check. ${short} item${short === 1 ? '' : 's'} to buy.`,
    url: `/check.html?block=${block}&v=report`,
    tag: 'report-' + block,
  });
  send(res, 200, r);
});
