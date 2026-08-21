import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, validKey } from '../functions/api/sync.js';

const key = 'A'.repeat(43);

test('sync server only accepts opaque derived keys', () => {
  assert.equal(validKey(key), true);
  assert.equal(validKey('short-human-code'), false);
  assert.equal(validKey('!'.repeat(43)), false);
});

test('stale sync pushes are rejected instead of overwriting newer cloud data', async () => {
  const db = memoryDb();
  const first = await onRequestPost(context(db, { operation:'push', key, payload:'cipher-one', expectedUpdatedAt:0 }));
  assert.equal(first.status, 200);
  const firstBody = await first.json();

  const stale = await onRequestPost(context(db, { operation:'push', key, payload:'cipher-two', expectedUpdatedAt:0 }));
  assert.equal(stale.status, 409);

  const current = await onRequestPost(context(db, { operation:'pull', key }));
  assert.equal(current.status, 200);
  const currentBody = await current.json();
  assert.equal(currentBody.payload, 'cipher-one');

  const second = await onRequestPost(context(db, { operation:'push', key, payload:'cipher-two', expectedUpdatedAt:firstBody.updatedAt }));
  assert.equal(second.status, 200);
});

test('cross-site browser requests are rejected', async () => {
  const db = memoryDb();
  const request = new Request('https://words.example/api/sync', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'sec-fetch-site':'cross-site' },
    body:JSON.stringify({ operation:'pull', key }),
  });
  const response = await onRequestPost({ request, env:{ WORDS_DB:db } });
  assert.equal(response.status, 403);
});

function context(db, body) {
  return {
    env:{ WORDS_DB:db },
    request:new Request('https://words.example/api/sync', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify(body),
    }),
  };
}

function memoryDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              const row = rows.get(args[0]);
              if (!row) return null;
              if (sql.includes('payload, updated_at')) return { payload:row.payload, updated_at:row.updated_at };
              return { updated_at:row.updated_at };
            },
            async run() {
              if (!sql.startsWith('INSERT')) throw new Error('Unexpected SQL');
              const [code, payload, updatedAt, expected] = args;
              const current = rows.get(code);
              if (current && current.updated_at !== expected) return { meta:{ changes:0 } };
              rows.set(code, { payload, updated_at:updatedAt });
              return { meta:{ changes:1 } };
            },
          };
        },
      };
    },
  };
}
