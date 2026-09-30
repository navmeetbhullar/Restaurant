// Shared server code for the /api functions (runs on Vercel, not on phones).
// Files starting with "_" are not turned into their own endpoints.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { appendFileSync } from 'node:fs';

// Connects to Firebase with the service account key saved in Vercel
// (Settings > Environment Variables > FIREBASE_SERVICE_ACCOUNT).
export function fb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      const sa = JSON.parse(raw);
      initializeApp({ credential: cert(sa), projectId: sa.project_id });
    } else if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-stock' });   // local testing
    } else {
      throw httpError(503, 'Server is not set up yet: FIREBASE_SERVICE_ACCOUNT is missing in Vercel.');
    }
  }
  return { auth: getAuth(), db: getFirestore() };
}

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

// Wraps a handler: POST only (unless get: true), JSON errors, no crashes.
export const handler = (fn, { get = false } = {}) => async (req, res) => {
  try {
    if (req.method !== 'POST' && !(get && req.method === 'GET')) throw httpError(405, 'Method not allowed');
    await fn(req, res);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
};

// Who is calling? Checks the Firebase login pass the app sends.
export async function who(req, { admin = false } = {}) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw httpError(401, 'Not logged in');
  const { auth, db } = fb();
  let uid;
  try { uid = (await auth.verifyIdToken(h.slice(7))).uid; } catch { throw httpError(401, 'Login expired. Log in again.'); }
  const u = await db.doc('users/' + uid).get();
  const role = u.exists ? u.data().role : null;
  if (!['admin', 'checker'].includes(role)) throw httpError(403, 'No access');
  if (admin && role !== 'admin') throw httpError(403, 'Admins only');
  return { uid, ...u.data() };
}

export async function uidsWithRole(role) {
  const { db } = fb();
  return (await db.collection('users').where('role', '==', role).get()).docs.map(d => d.id);
}

// Sends a notification to every phone these people turned notifications on for.
// Returns { sent, noPhone: [uids without any phone] }.
export async function pushTo(uids, { title, body, url = '/today.html', tag }) {
  const { db } = fb();
  const tokens = [];
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await db.collection('tokens').where('uid', 'in', uids.slice(i, i + 30)).get();
    snap.docs.forEach(d => tokens.push({ token: d.id, uid: d.data().uid }));
  }
  const noPhone = uids.filter(u => !tokens.some(t => t.uid === u));
  if (!tokens.length) return { sent: 0, noPhone };

  const data = { title, body, url, tag: tag || url };
  if (process.env.PUSH_LOG) {                       // local testing: write instead of sending
    appendFileSync(process.env.PUSH_LOG, JSON.stringify({ to: tokens.map(t => t.uid), ...data }) + '\n');
    return { sent: tokens.length, noPhone };
  }
  const r = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(t => t.token),
    data,
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  // forget phones that uninstalled or turned notifications off
  const dead = r.responses.map((x, i) => !x.success && /not-registered|invalid-registration|invalid-argument/.test(x.error?.code || '') ? tokens[i].token : null).filter(Boolean);
  await Promise.all(dead.map(t => db.doc('tokens/' + t).delete()));
  return { sent: r.successCount, noPhone };
}

// Today's date and hour in Sydney (Bella Vista), whatever the server's own clock says.
export function sydneyNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
