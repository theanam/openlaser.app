// Regenerates public/fonts/google-fonts.json, the list the font picker offers,
// from the Fontsource catalogue of Google Fonts (https://fontsource.org).
// src/lib/fonts/catalog.ts reads it at runtime; outlines come from the Fontsource CDN.
//   corepack pnpm fonts:update   (or: node scripts/update-google-fonts.mjs)
// Rows are compact: [id, family, category, weights, hasItalic]. Latin-capable
// fonts with an upright style only, sorted by family.
import { writeFileSync } from 'node:fs';

const res = await fetch('https://api.fontsource.org/v1/fonts?type=google');
if (!res.ok) throw new Error(`Fontsource API returned ${res.status}`);
const all = await res.json();
const CATEGORY = {
  'sans-serif': 'sans',
  serif: 'serif',
  display: 'display',
  handwriting: 'handwriting',
  monospace: 'mono',
};
const rows = all
  .filter(
    (f) =>
      f.subsets?.includes('latin') &&
      f.styles?.includes('normal') &&
      CATEGORY[f.category] &&
      f.weights?.length,
  )
  .sort((a, b) => a.family.localeCompare(b.family))
  .map((f) => [
    f.id,
    f.family,
    CATEGORY[f.category],
    [...f.weights].sort((a, b) => a - b),
    f.styles.includes('italic') ? 1 : 0,
  ]);
writeFileSync(new URL('../public/fonts/google-fonts.json', import.meta.url), JSON.stringify(rows));
console.log(`Wrote ${rows.length} fonts`);
