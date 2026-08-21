import { validateDeck } from './storage.js';

const MAX_SHARED_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ENCODED_FRAGMENT_CHARS = 48 * 1024 * 1024;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid shared deck encoding.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

export async function encodeDeck(deck) {
  if (!validateDeck(deck)) throw new Error('Invalid deck.');
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, deck }));
  if ('CompressionStream' in globalThis) {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    return `g.${bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }
  return `j.${bytesToBase64Url(raw)}`;
}

export async function decodeDeck(value) {
  if (typeof value !== 'string' || value.length > MAX_ENCODED_FRAGMENT_CHARS) {
    throw new Error('Shared deck is too large to decode safely.');
  }
  const separator = value.indexOf('.');
  if (separator <= 0) throw new Error('Invalid shared deck.');
  const kind = value.slice(0, separator);
  const payload = value.slice(separator + 1);
  if (kind !== 'g' && kind !== 'j') throw new Error('Unknown shared deck format.');

  let bytes = base64UrlToBytes(payload);
  if (kind === 'g') {
    if (!('DecompressionStream' in globalThis)) throw new Error('Compressed shared decks are not supported by this browser.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = await readStreamWithLimit(stream, MAX_SHARED_DECOMPRESSED_BYTES);
  } else if (bytes.byteLength > MAX_SHARED_DECOMPRESSED_BYTES) {
    throw new Error('Shared deck is too large to decode safely.');
  }

  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (parsed?.v !== 1 || !validateDeck(parsed.deck)) throw new Error('Invalid shared deck.');
  return parsed.deck;
}

async function readStreamWithLimit(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Shared deck is too large to decode safely.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
