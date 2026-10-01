// Admin uploads an invoice photo or PDF. Gemini reads it and matches each
// invoice line to what was ordered. The admin checks the result before saving.
// Needs GEMINI_API_KEY in Vercel (free key from aistudio.google.com).
import { handler, who, send, fb, httpError } from './_lib.js';
import { toOrder, fmtNum } from '../js/stock.js';

// Gemini models that can read photos and PDFs, tried in this order. Google's
// free models are often "busy" (error 503) or at their limit (429), so if one
// is busy the next is tried. GEMINI_MODEL in Vercel can put a model first.
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash',
  'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean))];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export default handler(async (req, res) => {
  await who(req, { admin: true });
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(503, 'Invoice reading is not set up yet: GEMINI_API_KEY is missing in Vercel.');

  const { block, file, mime } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(block))) throw httpError(400, 'Bad block');
  if (typeof file !== 'string' || !file.length) throw httpError(400, 'No file');
  if (!TYPES.includes(mime)) throw httpError(400, 'Use a photo (JPG, PNG) or a PDF');
  if (file.length > 4_000_000) throw httpError(413, 'File too big. Take a photo instead.');

  const { db } = fb();
  const check = (await db.doc('checks/' + block).get()).data();
  if (check?.status !== 'submitted') throw httpError(409, 'This stock check is not submitted');
  const ordered = Object.entries(check.items || {})
    .map(([id, l]) => ({ id, name: l.name, unit: l.unit, order: toOrder(l.need, l.counted, l.unit) }))
    .filter(l => l.order > 0);
  if (!ordered.length) throw httpError(409, 'Nothing was ordered for this block');

  const prompt = `You are checking a restaurant supplier invoice against what the restaurant ordered.

Ordered items (one per line: id | item name | unit | amount ordered):
${ordered.map(o => `${o.id} | ${o.name} | ${o.unit} | ${fmtNum(o.order)}`).join('\n')}

Read the invoice in the attached file. For EVERY ordered item above, find the matching invoice line.
Names may differ (short forms, brand names, Hindi or Punjabi names, spelling mistakes, plural forms).
Give "received" in the ordered item's own unit: convert when needed, for example 500 g = 0.5 kg,
2 x 10 kg bags = 20 kg, 1 carton of 24 cans = 24 cans. If an item is not on the invoice, received is 0.
If one invoice line clearly matches, copy its text into "invoiceText".
Put invoice lines that match no ordered item into "extra" with their name and quantity as written.
Do not invent lines that are not on the invoice.`;

  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: file } }, { text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          supplier: { type: 'STRING' },
          invoiceDate: { type: 'STRING' },
          items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            id: { type: 'STRING' }, received: { type: 'NUMBER' }, invoiceText: { type: 'STRING' } }, required: ['id', 'received'] } },
          extra: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            name: { type: 'STRING' }, qty: { type: 'STRING' } }, required: ['name'] } },
        },
        required: ['items', 'extra'],
      },
    },
  };
  const base = process.env.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const started = Date.now();
  let r = null, lastStatus = 0;
  // try each model; a busy model gets one more try after a short wait
  outer: for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() - started > 45000) break outer;          // stay inside Vercel's 60 s limit
      try {
        r = await fetch(`${base}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) { console.error('Gemini', model, 'no answer', e.name); r = null; lastStatus = 0; continue; }
      if (r.ok) { console.log('Gemini read the invoice with', model); break outer; }
      lastStatus = r.status;
      console.error('Gemini', model, r.status, (await r.text()).slice(0, 300));
      r = null;
      if (lastStatus === 503 && attempt === 0) { await sleep(1500); continue; }   // busy: wait, try once more
      break;                                // 429 limit, 404 unknown model, other: next model
    }
  }
  if (!r) throw httpError(502, lastStatus === 503 || lastStatus === 429
    ? 'Gemini is very busy right now. Wait a minute and tap "Read invoice" again, or type what arrived.'
    : 'Gemini could not read the invoice.');
  const out = await r.json();
  let parsed;
  try { parsed = JSON.parse(out.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''); }
  catch { throw httpError(502, 'Gemini gave an answer the app could not understand. Try a clearer photo.'); }

  // keep only ids we asked about, and sensible numbers
  const known = new Set(ordered.map(o => o.id));
  const received = {}, matched = {};
  for (const it of parsed.items || []) {
    if (!known.has(it.id)) continue;
    const n = Number(it.received);
    received[it.id] = isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0;
    if (it.invoiceText) matched[it.id] = String(it.invoiceText).slice(0, 120);
  }
  for (const o of ordered) if (!(o.id in received)) received[o.id] = 0;
  const extra = (parsed.extra || []).slice(0, 50).map(x => ({ name: String(x.name).slice(0, 80), qty: String(x.qty ?? '').slice(0, 40) }));

  send(res, 200, { received, matched, extra, supplier: String(parsed.supplier || '').slice(0, 80), invoiceDate: String(parsed.invoiceDate || '').slice(0, 40) });
});
