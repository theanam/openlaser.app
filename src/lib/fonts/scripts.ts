/* Which Fontsource subset file carries a character, and which characters need shaping.
   Ranges follow the Google Fonts subsets Fontsource serves (unicode-range per subset). CJK
   subsets are split into numbered slices and are left out. */

type Range = readonly [number, number];

/** Non-latin subsets, in the order a character is looked up (narrow subsets before wide ones). */
export const SUBSET_RANGES: ReadonlyArray<readonly [string, readonly Range[]]> = [
  [
    'bengali',
    [
      [0x0980, 0x09fe],
      [0x0951, 0x0952],
      [0x0964, 0x0965],
      [0x1cd0, 0x1cf7],
      [0xa8f1, 0xa8f1],
    ],
  ],
  [
    'devanagari',
    [
      [0x0900, 0x097f],
      [0x1cd0, 0x1cf6],
      [0xa830, 0xa839],
      [0xa8e0, 0xa8ff],
    ],
  ],
  ['gurmukhi', [[0x0a01, 0x0a76]]],
  ['gujarati', [[0x0a81, 0x0aff]]],
  ['oriya', [[0x0b01, 0x0b77]]],
  ['tamil', [[0x0b82, 0x0bfa]]],
  ['telugu', [[0x0c00, 0x0c7f]]],
  ['kannada', [[0x0c80, 0x0cf3]]],
  ['malayalam', [[0x0d00, 0x0d7f]]],
  [
    'sinhala',
    [
      [0x0d81, 0x0df4],
      [0x111e1, 0x111f4],
    ],
  ],
  ['thai', [[0x0e01, 0x0e5b]]],
  ['lao', [[0x0e81, 0x0edf]]],
  ['tibetan', [[0x0f00, 0x0fda]]],
  [
    'myanmar',
    [
      [0x1000, 0x109f],
      [0xa9e0, 0xa9fe],
      [0xaa60, 0xaa7f],
    ],
  ],
  [
    'khmer',
    [
      [0x1780, 0x17f9],
      [0x19e0, 0x19ff],
    ],
  ],
  [
    'georgian',
    [
      [0x10a0, 0x10ff],
      [0x1c90, 0x1cbf],
      [0x2d00, 0x2d2f],
    ],
  ],
  [
    'armenian',
    [
      [0x0530, 0x058f],
      [0xfb13, 0xfb17],
    ],
  ],
  [
    'ethiopic',
    [
      [0x1200, 0x139f],
      [0x2d80, 0x2dde],
      [0xab01, 0xab2e],
    ],
  ],
  [
    'hebrew',
    [
      [0x0590, 0x05ff],
      [0xfb1d, 0xfb4f],
    ],
  ],
  [
    'arabic',
    [
      [0x0600, 0x06ff],
      [0x0750, 0x077f],
      [0x0870, 0x08ff],
      [0xfb50, 0xfdff],
      [0xfe70, 0xfefc],
    ],
  ],
  ['greek', [[0x0370, 0x03ff]]],
  ['greek-ext', [[0x1f00, 0x1fff]]],
  [
    'cyrillic',
    [
      [0x0400, 0x045f],
      [0x0490, 0x0491],
      [0x04b0, 0x04b1],
      [0x2116, 0x2116],
    ],
  ],
  [
    'cyrillic-ext',
    [
      [0x0460, 0x052f],
      [0x1c80, 0x1c8a],
      [0x2de0, 0x2dff],
      [0xa640, 0xa69f],
    ],
  ],
  [
    'vietnamese',
    [
      [0x0102, 0x0103],
      [0x0110, 0x0111],
      [0x0128, 0x0129],
      [0x0168, 0x0169],
      [0x01a0, 0x01a1],
      [0x01af, 0x01b0],
      [0x1ea0, 0x1ef9],
    ],
  ],
  [
    'latin-ext',
    [
      [0x0100, 0x02ff],
      [0x1d00, 0x1dbf],
      [0x1e00, 0x1eff],
      [0x2c60, 0x2c7f],
      [0xa720, 0xa7ff],
    ],
  ],
];

/** Names for the picker's script filter. */
export const SCRIPT_LABELS: Record<string, string> = {
  bengali: 'Bangla',
  devanagari: 'Devanagari',
  gurmukhi: 'Gurmukhi',
  gujarati: 'Gujarati',
  oriya: 'Odia',
  tamil: 'Tamil',
  telugu: 'Telugu',
  kannada: 'Kannada',
  malayalam: 'Malayalam',
  sinhala: 'Sinhala',
  thai: 'Thai',
  lao: 'Lao',
  tibetan: 'Tibetan',
  myanmar: 'Myanmar',
  khmer: 'Khmer',
  georgian: 'Georgian',
  armenian: 'Armenian',
  ethiopic: 'Ethiopic',
  hebrew: 'Hebrew',
  arabic: 'Arabic',
  greek: 'Greek',
  'greek-ext': 'Greek',
  cyrillic: 'Cyrillic',
  'cyrillic-ext': 'Cyrillic',
  vietnamese: 'Vietnamese',
  'latin-ext': 'Latin',
};

const inRanges = (cp: number, ranges: readonly Range[]) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** Spaces and joiners belong to whatever run they sit in: a joiner must never split a word. */
export function isNeutral(cp: number): boolean {
  return cp === 0x20 || cp === 0xa0 || cp === 0x09 || (cp >= 0x200b && cp <= 0x200d) || cp === 0x2060;
}

/** The subset a non-latin character lives in, preferring subsets in `available`; null for latin. */
export function subsetFor(cp: number, available?: readonly string[]): string | null {
  let first: string | null = null;
  for (const [subset, ranges] of SUBSET_RANGES) {
    if (!inRanges(cp, ranges)) continue;
    if (!available || available.includes(subset)) return subset;
    first ??= subset;
  }
  return first;
}

/** Non-latin subsets a text needs, in first-use order. */
export function subsetsFor(text: string, available?: readonly string[]): string[] {
  const out = new Set<string>();
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (isNeutral(cp)) continue;
    const subset = subsetFor(cp, available);
    if (subset) out.add(subset);
  }
  return [...out];
}

/** The script a text is mostly written in, for the picker's filter; null for latin text. */
export function dominantScript(text: string): string | null {
  const counts = new Map<string, number>();
  for (const char of text) {
    const subset = subsetFor(char.codePointAt(0)!);
    if (subset && subset !== 'latin-ext' && subset !== 'vietnamese') {
      const script = subset.replace(/-ext$/, '');
      counts.set(script, (counts.get(script) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [script, n] of counts) if (!best || n > counts.get(best)!) best = script;
  return best;
}

const NOTO_SANS = 'Noto Sans';

/**
 * The face that draws a script when the chosen font has none of it, as browsers and other apps
 * fall back: Google's Noto family for that script. Noto Sans covers Greek, Cyrillic, Vietnamese
 * and extended Latin.
 */
export const FALLBACK_FAMILIES: Record<string, string> = {
  bengali: 'Noto Sans Bengali',
  devanagari: 'Noto Sans Devanagari',
  gurmukhi: 'Noto Sans Gurmukhi',
  gujarati: 'Noto Sans Gujarati',
  oriya: 'Noto Sans Oriya',
  tamil: 'Noto Sans Tamil',
  telugu: 'Noto Sans Telugu',
  kannada: 'Noto Sans Kannada',
  malayalam: 'Noto Sans Malayalam',
  sinhala: 'Noto Sans Sinhala',
  thai: 'Noto Sans Thai',
  lao: 'Noto Sans Lao',
  tibetan: 'Noto Serif Tibetan',
  myanmar: 'Noto Sans Myanmar',
  khmer: 'Noto Sans Khmer',
  georgian: 'Noto Sans Georgian',
  armenian: 'Noto Sans Armenian',
  ethiopic: 'Noto Sans Ethiopic',
  hebrew: 'Noto Sans Hebrew',
  arabic: 'Noto Sans Arabic',
  greek: NOTO_SANS,
  'greek-ext': NOTO_SANS,
  cyrillic: NOTO_SANS,
  'cyrillic-ext': NOTO_SANS,
  vietnamese: NOTO_SANS,
  'latin-ext': NOTO_SANS,
};

/** Code points of `text` that live in `subset` (as `subsetFor` assigns them). */
export function codePointsIn(text: string, subset: string, available?: readonly string[]): number[] {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (!isNeutral(cp) && subsetFor(cp, available) === subset) out.push(cp);
  }
  return out;
}
