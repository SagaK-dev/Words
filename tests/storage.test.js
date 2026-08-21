import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData, validateData } from '../src/storage.js';

test('invalid data falls back safely', () => {
  assert.equal(validateData(null), null);
});

test('progress for missing cards is discarded', () => {
  const data = initialData();
  data.progress.ghost = { cardId:'ghost', reviews:99 };
  const valid = validateData(data);
  assert.deepEqual(valid.progress, {});
});
