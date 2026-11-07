/* Low-level font file helpers that opentype.js lacks: format sniffing and pulling one font out of
   a TrueType collection (.ttc, common for macOS system fonts). Pure. */

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2' | 'ttc' | 'unknown';

export function fontFormat(bytes: Uint8Array): FontFormat {
  if (bytes.length < 4) return 'unknown';
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === 'ttcf') return 'ttc';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return 'ttf';
  return 'unknown';
}

/** Number of fonts in a collection. */
export function collectionSize(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8);
}

/**
 * Font `index` of a collection as a standalone font file: its table directory with every table
 * copied after it (4-byte aligned) and offsets rewritten. Table checksums stay valid because the
 * table bytes are unchanged.
 */
export function extractFromCollection(bytes: Uint8Array, index: number): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8);
  if (index < 0 || index >= count) throw new RangeError(`Font ${index} is outside the collection`);
  const dir = view.getUint32(12 + index * 4);
  const numTables = view.getUint16(dir + 4);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const at = dir + 12 + i * 16;
    return {
      tag: view.getUint32(at),
      checksum: view.getUint32(at + 4),
      offset: view.getUint32(at + 8),
      length: view.getUint32(at + 12),
    };
  });
  const headerSize = 12 + numTables * 16;
  const pad = (n: number) => (n + 3) & ~3;
  const total = tables.reduce((n, t) => n + pad(t.length), headerSize);
  const out = new Uint8Array(total);
  const w = new DataView(out.buffer);
  out.set(bytes.subarray(dir, dir + 12), 0);
  let cursor = headerSize;
  tables.forEach((t, i) => {
    const at = 12 + i * 16;
    w.setUint32(at, t.tag);
    w.setUint32(at + 4, t.checksum);
    w.setUint32(at + 8, cursor);
    w.setUint32(at + 12, t.length);
    out.set(bytes.subarray(t.offset, t.offset + t.length), cursor);
    cursor += pad(t.length);
  });
  return out;
}

const WEIGHT_WORDS: Array<[RegExp, number]> = [
  [/(hairline|thin)/, 100],
  [/(extra|ultra)[\s-]?light/, 200],
  [/(semi|demi)[\s-]?bold/, 600],
  [/(extra|ultra)[\s-]?bold/, 800],
  [/(black|heavy)/, 900],
  [/light/, 300],
  [/medium/, 500],
  [/bold/, 700],
];

/** Weight and slant from a style name such as "Semibold Italic" or "Bold Condensed Oblique". */
export function parseStyleName(style: string): { weight: number; italic: boolean } {
  const s = style.toLowerCase();
  const weight = WEIGHT_WORDS.find(([re]) => re.test(s))?.[1] ?? 400;
  return { weight, italic: /italic|oblique/.test(s) };
}
