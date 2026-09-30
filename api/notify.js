// Admin taps "Send notification" on Today: remind the chosen checkers.
import { handler, who, send, fb, pushTo, httpError } from './_lib.js';

export default handler(async (req, res) => {
  const me = await who(req, { admin: true });
  const uids = Array.isArray(req.body?.uids) ? req.body.uids.filter(u => typeof u === 'string').slice(0, 50) : [];
  if (!uids.length) throw httpError(400, 'No checkers chosen');
  // only real checkers can be sent this
  const { db } = fb();
  const users = await Promise.all(uids.map(u => db.doc('users/' + u).get()));
  const checkers = users.filter(u => u.exists && u.data().role === 'checker').map(u => u.id);
  const r = await pushTo(checkers, {
    title: 'Stock check needed',
    body: `${me.name || 'The admin'} asks you to do the stock check now.`,
    url: '/today.html',
    tag: 'check',
  });
  send(res, 200, r);
});
