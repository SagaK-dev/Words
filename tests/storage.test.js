import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData, saveData, validateData, STORAGE_KEY } from '../src/storage.js';

test('invalid data falls back safely', () => {
  assert.equal(validateData(null), null);
});

test('progress for missing cards is discarded', () => {
  const data = initialData();
  data.progress.ghost = { cardId:'ghost', reviews:99 };
  const valid = validateData(data);
  assert.deepEqual(valid.progress, {});
});

test('validation does not cap session history', () => {
  const data = initialData();
  data.sessions = Array.from({ length: 750 }, (_, index) => ({
    id: `session-${index}`,
    startedAt: index,
    reviewed: 1,
  }));
  const valid = validateData(data);
  assert.equal(valid.sessions.length, 750);
});

test('saving preserves older sessions when an older client submits a trimmed window', () => {
  const storage = {
    value: null,
    getItem(key) { return key === STORAGE_KEY ? this.value : null; },
    setItem(key, value) { if (key === STORAGE_KEY) this.value = value; },
    removeItem() { this.value = null; },
  };

  const existing = initialData();
  existing.sessions = Array.from({ length: 600 }, (_, index) => ({
    id: `session-${index}`,
    startedAt: index,
    reviewed: 1,
  }));
  storage.value = JSON.stringify(existing);

  const incoming = initialData();
  incoming.sessions = [
    ...existing.sessions.slice(-499),
    { id: 'session-new', startedAt: 601, reviewed: 1 },
  ];

  const saved = saveData(incoming, storage);
  assert.equal(saved.sessions.length, 601);
  assert.equal(saved.sessions[0].id, 'session-0');
  assert.equal(saved.sessions.at(-1).id, 'session-new');
});
