import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDeck, encodeDeck } from '../src/share.js';

test('shared deck round-trips without trusting recipient IDs', async () => {
  const deck = {
    id: 'source',
    name: 'Example',
    description: 'Deck',
    cards: [{ id:'card-1', front:'Question', back:'Answer' }],
  };
  const encoded = await encodeDeck(deck);
  const decoded = await decodeDeck(encoded);
  assert.equal(decoded.name, 'Example');
  assert.equal(decoded.cards[0].front, 'Question');
});

test('unknown share formats and malformed base64url are rejected', async () => {
  await assert.rejects(() => decodeDeck('x.abc'), /Unknown shared deck format/);
  await assert.rejects(() => decodeDeck('j.***'), /Invalid shared deck encoding/);
});

test('shared payload must contain a valid deck shape', async () => {
  const raw = Buffer.from(JSON.stringify({ v:1, deck:{ name:'broken', cards:[{ front:42, back:'A' }] } })).toString('base64url');
  await assert.rejects(() => decodeDeck(`j.${raw}`), /Invalid shared deck/);
});
