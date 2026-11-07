import { isSendableText, wireLength } from '../grbl/line-accounting';

/**
 * Turns G-code text (e.g. an opened .gcode file) into streamable lines: comments, blank lines
 * and surrounding whitespace removed. Removing comments also removes stray `?`, `!` and `~`
 * characters, which GRBL would execute as realtime commands even inside a comment.
 */
export function prepareGcodeLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw
      .replace(/\([^)]*\)/g, '')
      .replace(/;.*$/, '')
      .trim();
    if (line !== '' && line !== '%') lines.push(line);
  }
  return lines;
}

/** Why a line cannot be streamed safely, or null if it can. */
export function streamLineProblem(line: string, rxSize: number): string | null {
  if (!isSendableText(line)) return 'contains characters other than printable ASCII';
  if (/[?!~]/.test(line)) return 'contains a realtime command character (? ! ~)';
  if (wireLength(line) > rxSize - 1) return `is longer than the controller buffer (${rxSize - 1} bytes)`;
  return null;
}
