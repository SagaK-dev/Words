const MAX_PAYLOAD = 2_000_000;

export async function onRequestGet(context) {
  if (!context.env.WORDS_DB) return json({ error: 'Cloud sync is not configured.' }, 503);
  const code = new URL(context.request.url).searchParams.get('code') || '';
  if (!validCode(code)) return json({ error: 'Invalid sync code.' }, 400);
  const row = await context.env.WORDS_DB.prepare('SELECT payload, updated_at FROM sync_blobs WHERE code = ?').bind(code).first();
  return row ? json({ payload: row.payload, updatedAt: row.updated_at }) : json({ error: 'No sync data found.' }, 404);
}

export async function onRequestPost(context) {
  if (!context.env.WORDS_DB) return json({ error: 'Cloud sync is not configured.' }, 503);
  const length = Number(context.request.headers.get('content-length') || 0);
  if (length > MAX_PAYLOAD + 4096) return json({ error: 'Payload too large.' }, 413);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!validCode(body?.code) || typeof body?.payload !== 'string' || body.payload.length > MAX_PAYLOAD) return json({ error: 'Invalid sync payload.' }, 400);
  const updatedAt = Date.now();
  await context.env.WORDS_DB.prepare('INSERT INTO sync_blobs(code,payload,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at').bind(body.code, body.payload, updatedAt).run();
  return json({ ok: true, updatedAt });
}

function validCode(code) { return /^[A-Za-z0-9_-]{12,80}$/.test(code); }
function json(value, status = 200) { return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
