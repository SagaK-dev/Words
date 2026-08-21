import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProgress, scheduleReview, buildQueue, deckStats, DAY_MS } from '../src/scheduler.js';

test('good rating pushes due date forward and raises stability', () => {
  const now = 1_700_000_000_000;
  const next = scheduleReview(defaultProgress('a'), 2, 1800, now);
  assert.ok(next.dueAt > now);
  assert.ok(next.stabilityDays >= 0.35);
  assert.equal(next.correctStreak, 1);
});

test('again creates a short retry and records a lapse', () => {
  const now = 1_700_000_000_000;
  const learned = { ...defaultProgress('a'), reviews: 3, stabilityDays: 10, correctStreak: 3 };
  const next = scheduleReview(learned, 0, 6000, now);
  assert.equal(next.lapses, 1);
  assert.equal(next.correctStreak, 0);
  assert.ok(next.dueAt - now < DAY_MS);
});

test('review queue only includes cards currently due', () => {
  const now = 1_700_000_000_000;
  const cards = [{id:'a'},{id:'b'},{id:'c'}];
  const progress = {
    a: { ...defaultProgress('a'), reviews:1, dueAt: now - 1 },
    b: { ...defaultProgress('b'), reviews:1, dueAt: now + DAY_MS },
  };
  assert.deepEqual(buildQueue(cards, progress, { mode:'review', count:'all', now }).map(c => c.id), ['a']);
  assert.equal(deckStats(cards, progress, now).new, 1);
});
