import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));

export function goldenPath(caseName: string, file: string): string {
  return join(GOLDEN_DIR, caseName, file);
}

export function readFixture(caseName: string, file: string): string {
  return readFileSync(goldenPath(caseName, file), 'utf8');
}

export function readFixtureBytes(caseName: string, file: string): Uint8Array {
  return new Uint8Array(readFileSync(goldenPath(caseName, file)));
}

/**
 * Compares G-code against tests/golden/<case>/expected.gcode.
 * Expected files change only through `pnpm golden:update` (GOLDEN_UPDATE=1), and the diff is reviewed.
 */
export function expectGolden(caseName: string, lines: string[]): void {
  const file = goldenPath(caseName, 'expected.gcode');
  const actual = lines.join('\n') + '\n';
  if (process.env.GOLDEN_UPDATE === '1') {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  if (!existsSync(file)) {
    throw new Error(`Missing golden file ${file}. Run \`pnpm golden:update\` and review the result.`);
  }
  expect(actual).toBe(readFileSync(file, 'utf8'));
}
