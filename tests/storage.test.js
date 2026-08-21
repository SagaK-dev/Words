import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, initialData, replaceData, saveData, validateData, STORAGE_KEY } from '../src/storage.js';

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
  const storage = memoryStorage();
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

test('exact restore replaces old session history instead of merging it', () => {
  const storage = memoryStorage();
  const existing = initialData();
  existing.sessions = [{ id:'old', startedAt:1, reviewed:1 }];
  storage.value = JSON.stringify(existing);

  const backup = initialData();
  backup.sessions = [{ id:'backup', startedAt:2, reviewed:1 }];
  const restored = replaceData(backup, storage);
  assert.deepEqual(restored.sessions.map(session => session.id), ['backup']);
  assert.deepEqual(JSON.parse(storage.value).sessions.map(session => session.id), ['backup']);
});

test('new deck copies always receive fresh card IDs', () => {
  const sourceCards = [{ id:'shared-card', front:'Q', back:'A' }];
  const first = createDeck('one', sourceCards);
  const second = createDeck('two', sourceCards);
  assert.notEqual(first.cards[0].id, 'shared-card');
  assert.notEqual(first.cards[0].id, second.cards[0].id);
});

test('validation repairs duplicate IDs and sanitizes progress numbers', () => {
  const raw = initialData();
  raw.decks = [
    { id:'same-deck', name:'A', cards:[{ id:'same-card', front:'Q1', back:'A1' }] },
    { id:'same-deck', name:'B', cards:[{ id:'same-card', front:'Q2', back:'A2' }] },
  ];
  raw.progress['same-card'] = {
    reviews: 4,
    lapses: 99,
    correctStreak: 99,
    stabilityDays: 'not-a-number',
    difficulty: 9,
    dueAt: -20,
    avgResponseMs: -1,
  };
  const valid = validateData(raw);
  assert.equal(new Set(valid.decks.map(deck => deck.id)).size, 2);
  assert.equal(new Set(valid.decks.flatMap(deck => deck.cards.map(card => card.id))).size, 2);
  assert.equal(valid.progress['same-card'].difficulty, 1);
  assert.equal(valid.progress['same-card'].lapses, 4);
  assert.equal(valid.progress['same-card'].correctStreak, 4);
  assert.equal(valid.progress['same-card'].dueAt, 0);
  assert.equal(valid.progress['same-card'].avgResponseMs, 0);
});

function memoryStorage() {
  return {
    value: null,
    getItem(key) { return key === STORAGE_KEY ? this.value : null; },
    setItem(key, value) { if (key === STORAGE_KEY) this.value = value; },
    removeItem() { this.value = null; },
  };
}
