import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, rowsToCards } from '../src/importers.js';

test('parses quoted CSV', () => {
  const rows = parseDelimited('front,back\n"hello, world","こんにちは"\ncat,猫');
  assert.deepEqual(rows[1], ['hello, world','こんにちは']);
  assert.equal(rowsToCards(rows,0,1,true).length, 2);
});

test('detects TSV and preserves multiline quoted cells', () => {
  const rows = parseDelimited('q\ta\n"line1\nline2"\tanswer');
  assert.equal(rows[1][0], 'line1\nline2');
});
