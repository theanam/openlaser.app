// Adds .js (or /index.js for folders) to relative imports in the emitted .d.ts files, so projects
// that resolve modules the Node way (nodenext) find them.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const IMPORT = /((?:from\s+|import\()['"])(\.\.?\/[^'"]+?)(['"])/g;

function fix(file) {
  const text = readFileSync(file, 'utf8').replace(IMPORT, (match, before, spec, after) => {
    if (spec.endsWith('.js')) return match;
    const target = join(dirname(file), spec);
    const folder = existsSync(target) && statSync(target).isDirectory();
    return `${before}${spec}${folder ? '/index.js' : '.js'}${after}`;
  });
  writeFileSync(file, text);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.d.ts')) fix(path);
  }
}

walk(root);
