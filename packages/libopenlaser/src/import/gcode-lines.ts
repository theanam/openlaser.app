/** GRBL 1.1 rejects lines of 80 characters or more (its line buffer limit). */
const MAX_LINE_LENGTH = 80;

export interface GcodeLineIssue {
  /** 0-based index into the lines passed to validateGcodeLines. */
  index: number;
  line: string;
  message: string;
}

/**
 * Prepares a G-code file for streaming: strips `;` and `( )` comments and surrounding whitespace,
 * drops empty lines and `%` program delimiters. Line content is otherwise sent unchanged.
 */
export function splitGcodeLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = stripComments(raw).trim();
    if (line.length === 0 || line === '%') continue;
    out.push(line);
  }
  return out;
}

/** Lines GRBL would reject outright. Long lines are reported, never split or rewritten. */
export function validateGcodeLines(lines: readonly string[]): GcodeLineIssue[] {
  const issues: GcodeLineIssue[] = [];
  lines.forEach((line, index) => {
    if (line.length >= MAX_LINE_LENGTH) {
      issues.push({
        index,
        line,
        message: `Line ${index + 1} is ${line.length} characters; GRBL accepts at most ${MAX_LINE_LENGTH - 1}.`,
      });
    }
  });
  return issues;
}

function stripComments(line: string): string {
  if (line.indexOf(';') < 0 && line.indexOf('(') < 0) return line;
  let out = '';
  let inParen = false;
  for (const ch of line) {
    if (inParen) {
      if (ch === ')') inParen = false;
      continue;
    }
    if (ch === ';') break;
    if (ch === '(') {
      inParen = true;
      continue;
    }
    out += ch;
  }
  return out;
}
