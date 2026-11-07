/**
 * Minimal G-code interpreter for tests: expands modal state (G0/G1, X, Y, F, S, M3/M4/M5) into
 * absolute moves, so optimized and unoptimized output can be compared by what the machine does.
 */
export interface InterpretedMove {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rapid: boolean;
  feed: number;
  /** Effective laser S: 0 for rapids and while the laser is off (M5). */
  s: number;
  laserMode: 'M3' | 'M4' | 'M5';
}

export function interpretGcode(lines: readonly string[]): InterpretedMove[] {
  let motion: 'G0' | 'G1' | null = null;
  let x = 0;
  let y = 0;
  let feed = 0;
  let s = 0;
  let laser: 'M3' | 'M4' | 'M5' = 'M5';
  const moves: InterpretedMove[] = [];
  for (const raw of lines) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    let nx = x;
    let ny = y;
    let hasAxis = false;
    for (const word of line.split(/\s+/)) {
      const letter = word[0];
      const value = Number(word.slice(1));
      if (Number.isNaN(value)) throw new Error(`Bad word "${word}" in "${raw}"`);
      if (letter === 'G' && (value === 0 || value === 1)) motion = value === 0 ? 'G0' : 'G1';
      else if (letter === 'M' && (value === 3 || value === 4 || value === 5))
        laser = `M${value}` as 'M3' | 'M4' | 'M5';
      else if (letter === 'X') {
        nx = value;
        hasAxis = true;
      } else if (letter === 'Y') {
        ny = value;
        hasAxis = true;
      } else if (letter === 'F') feed = value;
      else if (letter === 'S') s = value;
    }
    if (hasAxis) {
      if (!motion) throw new Error(`Axis words without a motion mode: "${raw}"`);
      const rapid = motion === 'G0';
      moves.push({
        x0: x,
        y0: y,
        x1: nx,
        y1: ny,
        rapid,
        feed: rapid ? 0 : feed,
        s: rapid || laser === 'M5' ? 0 : s,
        laserMode: laser,
      });
      x = nx;
      y = ny;
    }
  }
  return moves;
}
