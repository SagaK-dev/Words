function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
export async function encodeDeck(deck) {
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, deck }));
  if ('CompressionStream' in globalThis) {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    return `g.${bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }
  return `j.${bytesToBase64Url(raw)}`;
}
export async function decodeDeck(value) {
  const [kind, payload] = value.split('.', 2);
  let bytes = base64UrlToBytes(payload || '');
  if (kind === 'g') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (parsed?.v !== 1 || !parsed.deck) throw new Error('Invalid shared deck.');
  return parsed.deck;
}
