const MAX_XLSX_ENTRIES = 20_000;
const MAX_XLSX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_XLSX_TOTAL_BYTES = 256 * 1024 * 1024;

export function parseDelimited(text, delimiter = null) {
  const normalized = String(text).replace(/^\uFEFF/, '');
  const delim = delimiter || detectDelimiter(normalized);
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '"') {
      if (quoted && normalized[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && normalized[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',','\t',';'].map(d => [d, (sample.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length]);
  counts.sort((a,b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : '\t';
}

export function rowsToCards(rows, frontIndex = 0, backIndex = 1, hasHeader = false) {
  return rows.slice(hasHeader ? 1 : 0).map(row => ({ front: String(row[frontIndex] ?? '').trim(), back: String(row[backIndex] ?? '').trim() })).filter(card => card.front && card.back);
}

export async function parseXlsx(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) throw new Error('XLSX input must be an ArrayBuffer.');
  const files = await unzipXlsx(arrayBuffer);
  const workbookXml = files.get('xl/workbook.xml');
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) throw new Error('Invalid XLSX workbook.');
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml') || '');
  const workbook = parseXml(workbookXml, 'workbook');
  const rels = parseXml(relsXml, 'relationships');
  const relMap = new Map([...rels.querySelectorAll('Relationship')].map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
  const sheets = [];
  for (const sheet of workbook.querySelectorAll('sheet')) {
    const name = sheet.getAttribute('name') || 'Sheet';
    const relId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = relMap.get(relId);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = files.get(normalizePath(path));
    if (xml) sheets.push({ name, rows: parseWorksheet(xml, shared) });
  }
  return sheets;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = parseXml(xml, 'shared strings');
  return [...doc.querySelectorAll('si')].map(si => [...si.querySelectorAll('t')].map(t => t.textContent || '').join(''));
}

function parseWorksheet(xml, shared) {
  const doc = parseXml(xml, 'worksheet');
  const rows = [];
  for (const rowNode of doc.querySelectorAll('sheetData > row')) {
    const row = [];
    for (const cell of rowNode.querySelectorAll('c')) {
      const ref = cell.getAttribute('r') || '';
      const colLetters = ref.match(/^[A-Z]+/i)?.[0] || 'A';
      const col = lettersToIndex(colLetters);
      const type = cell.getAttribute('t');
      const v = cell.querySelector('v')?.textContent || '';
      let value = v;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...cell.querySelectorAll('is t')].map(n => n.textContent || '').join('');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      row[col] = value;
    }
    rows.push(row.map(value => value ?? ''));
  }
  return rows;
}

function parseXml(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(`Invalid XLSX ${label} XML.`);
  return doc;
}

function lettersToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return parts.join('/');
}

async function unzipXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid ZIP container.');
  ensureRange(view, eocd, 22);
  const entries = view.getUint16(eocd + 10, true);
  if (entries > MAX_XLSX_ENTRIES) throw new Error('XLSX archive has too many ZIP entries.');
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();
  let totalUncompressed = 0;

  for (let n = 0; n < entries; n += 1) {
    ensureRange(view, offset, 46);
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const centralSize = 46 + nameLen + extraLen + commentLen;
    ensureRange(view, offset, centralSize);

    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES) throw new Error('XLSX entry is too large to expand safely.');
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_XLSX_TOTAL_BYTES) throw new Error('XLSX workbook is too large to expand safely.');

    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));
    ensureRange(view, localOffset, 30);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Invalid ZIP entry.');
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    ensureRange(view, start, compressedSize);
    const compressed = bytes.slice(start, start + compressedSize);

    let content;
    if (method === 0) {
      if (compressed.byteLength > MAX_XLSX_ENTRY_BYTES) throw new Error('XLSX entry is too large to read safely.');
      content = compressed;
    } else if (method === 8) {
      if (!('DecompressionStream' in globalThis)) throw new Error('This browser cannot decompress XLSX files.');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      content = await readStreamWithLimit(stream, Math.min(MAX_XLSX_ENTRY_BYTES, Math.max(uncompressedSize + 1024, 1024)));
    } else throw new Error(`Unsupported XLSX compression method: ${method}`);

    if (uncompressedSize && content.byteLength !== uncompressedSize) throw new Error('XLSX entry size does not match the ZIP directory.');
    files.set(normalizePath(name), decoder.decode(content));
    offset += centralSize;
  }
  return files;
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
        throw new Error('XLSX entry expanded beyond its safe size.');
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

function ensureRange(view, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error('Invalid ZIP bounds.');
  }
}
