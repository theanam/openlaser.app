/** Builds ASCII DXF text from entity code lists, the way CAD tools lay files out. */
export type Codes = Array<[number, string | number]>;

const pairs = (codes: Codes) => codes.map(([c, v]) => `${c}\n${v}`).join('\n');

export function dxf(options: {
  units?: number;
  layers?: Array<{ name: string; color: number; flags?: number }>;
  blocks?: Array<{ name: string; base?: [number, number]; entities: Codes[] }>;
  entities: Codes[];
}): string {
  const out: string[] = [];
  out.push(
    pairs([
      [0, 'SECTION'],
      [2, 'HEADER'],
      ...(options.units !== undefined
        ? ([
            [9, '$INSUNITS'],
            [70, options.units],
          ] as Codes)
        : []),
      [0, 'ENDSEC'],
    ]),
  );
  out.push(
    pairs([
      [0, 'SECTION'],
      [2, 'TABLES'],
      [0, 'TABLE'],
      [2, 'LAYER'],
    ]),
  );
  for (const l of options.layers ?? [])
    out.push(
      pairs([
        [0, 'LAYER'],
        [2, l.name],
        [70, l.flags ?? 0],
        [62, l.color],
      ]),
    );
  out.push(
    pairs([
      [0, 'ENDTAB'],
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'BLOCKS'],
    ]),
  );
  for (const b of options.blocks ?? []) {
    out.push(
      pairs([
        [0, 'BLOCK'],
        [2, b.name],
        [10, b.base?.[0] ?? 0],
        [20, b.base?.[1] ?? 0],
      ]),
    );
    for (const e of b.entities) out.push(pairs(e));
    out.push(pairs([[0, 'ENDBLK']]));
  }
  out.push(
    pairs([
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]),
  );
  for (const e of options.entities) out.push(pairs(e));
  out.push(
    pairs([
      [0, 'ENDSEC'],
      [0, 'EOF'],
    ]),
  );
  return out.join('\n') + '\n';
}

export const line = (x1: number, y1: number, x2: number, y2: number, extra: Codes = []): Codes => [
  [0, 'LINE'],
  ...(extra.some(([c]) => c === 8) ? [] : ([[8, '0']] as Codes)),
  ...extra,
  [10, x1],
  [20, y1],
  [11, x2],
  [21, y2],
];
