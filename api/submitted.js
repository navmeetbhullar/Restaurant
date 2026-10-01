// A checker submitted the stock check: tell the admins the report is ready.
import { handler, who, send, fb, pushTo, uidsWithRole, httpError } from './_lib.js';
import { toOrder } from '../js/stock.js';

export default handler(async (req, res) => {
  await who(req);
  const block = String(req.body?.block || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(block)) throw httpError(400, 'Bad block');
  const { db } = fb();
  const ref = db.doc('checks/' + block);

  // tell the admins once per block, even if Submit is pressed twice
  const check = await db.runTransaction(async t => {
    const c = (await t.get(ref)).data();
    if (c?.status !== 'submitted') throw httpError(409, 'Check is not submitted');
    if (c.adminToldAt) return null;
    t.update(ref, { adminToldAt: new Date() });
    return c;
  });
  if (!check) return send(res, 200, { sent: 0, already: true });

  const short = Object.values(check.items || {}).filter(l => toOrder(l.need, l.counted, l.unit) > 0).length;
  const r = await pushTo(await uidsWithRole('admin'), {
    title: 'Stock report ready',
    body: `${check.checkedBy || 'A checker'} finished the stock check. ${short} item${short === 1 ? '' : 's'} to buy.`,
    url: `/check.html?block=${block}&v=report`,
    tag: 'report-' + block,
  });
  send(res, 200, r);
});
