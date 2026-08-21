const MAX_PAYLOAD = 2_000_000;
const MAX_REQUEST_BYTES = MAX_PAYLOAD + 16_384;

export async function onRequestGet() {
  return json({ error: 'Use POST for cloud sync.' }, 405, { allow: 'POST' });
}

export async function onRequestPost(context) {
  if (!isSameOriginBrowserRequest(context.request)) return json({ error: 'Cross-site requests are not allowed.' }, 403);
  if (!context.env.WORDS_DB) return json({ error: 'Cloud sync is not configured.' }, 503);

  let body;
  try {
    body = JSON.parse(await readRequestText(context.request, MAX_REQUEST_BYTES));
  } catch (error) {
    return json({ error: error instanceof PayloadTooLargeError ? 'Payload too large.' : 'Invalid JSON.' }, error instanceof PayloadTooLargeError ? 413 : 400);
  }

  if (!validKey(body?.key) || !['pull', 'push'].includes(body?.operation)) {
    return json({ error: 'Invalid sync request.' }, 400);
  }

  if (body.operation === 'pull') {
    const row = await context.env.WORDS_DB.prepare(
      'SELECT payload, updated_at FROM sync_blobs WHERE code = ?'
    ).bind(body.key).first();
    return row
      ? json({ payload: row.payload, updatedAt: row.updated_at })
      : json({ error: 'No sync data found.' }, 404);
  }

  if (typeof body.payload !== 'string' || body.payload.length > MAX_PAYLOAD) {
    return json({ error: 'Invalid sync payload.' }, 400);
  }
  const expectedUpdatedAt = normalizeTimestamp(body.expectedUpdatedAt);
  if (expectedUpdatedAt === null) return json({ error: 'Invalid sync version.' }, 400);

  const updatedAt = Date.now();
  const result = await context.env.WORDS_DB.prepare(
    `INSERT INTO sync_blobs(code,payload,updated_at)
     VALUES(?,?,?)
     ON CONFLICT(code) DO UPDATE SET
       payload=excluded.payload,
       updated_at=excluded.updated_at
     WHERE sync_blobs.updated_at = ?`
  ).bind(body.key, body.payload, updatedAt, expectedUpdatedAt).run();

  if ((result?.meta?.changes ?? 0) === 0) {
    const current = await context.env.WORDS_DB.prepare(
      'SELECT updated_at FROM sync_blobs WHERE code = ?'
    ).bind(body.key).first();
    return json({
      error: 'Cloud data changed on another device. Pull before pushing again.',
      currentUpdatedAt: current?.updated_at ?? 0,
    }, 409);
  }

  return json({ ok: true, updatedAt });
}

export function validKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{32,100}$/.test(key);
}

function normalizeTimestamp(value) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function readRequestText(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function isSameOriginBrowserRequest(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

class PayloadTooLargeError extends Error {}

function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}
