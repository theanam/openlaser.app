/* Boundary loops of a binary mask, following the cracks between pixels. Each loop runs clockwise on screen
   with the inside on its right; holes come out as separate loops, so filling all loops with the even-odd
   rule reproduces the mask exactly. Diagonal-only contacts count as separate (4-connectivity). */

/**
 * Trace a mask of `w`×`h` (non-zero = inside). Returns loops as flat [x0, y0, x1, y1, …] lattice
 * coordinates, keeping only the vertices where the boundary turns.
 */
export function traceLoops(mask: Uint8Array, w: number, h: number): Int32Array[] {
  const W = w + 1;
  const nextA = new Int32Array(W * (h + 1)).fill(-1);
  const nextB = new Int32Array(W * (h + 1)).fill(-1);
  const add = (from: number, to: number) => {
    if (nextA[from] < 0) nextA[from] = to;
    else nextB[from] = to;
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const v = y * W + x;
      if (!inside(x, y - 1)) add(v, v + 1); // top: rightward
      if (!inside(x + 1, y)) add(v + 1, v + 1 + W); // right: downward
      if (!inside(x, y + 1)) add(v + 1 + W, v + W); // bottom: leftward
      if (!inside(x - 1, y)) add(v + W, v); // left: upward
    }

  const loops: Int32Array[] = [];
  const pts: number[] = [];
  for (let start = 0; start < nextA.length; start++) {
    while (nextA[start] >= 0 || nextB[start] >= 0) {
      const first = nextA[start] >= 0 ? nextA[start] : nextB[start];
      if (nextA[start] === first) nextA[start] = -1;
      else nextB[start] = -1;
      pts.length = 0;
      let prev = start;
      let cur = first;
      push(pts, start, W);
      while (cur !== start) {
        const dx = (cur % W) - (prev % W);
        const dy = Math.floor(cur / W) - Math.floor(prev / W);
        let to: number;
        const a = nextA[cur];
        const b = nextB[cur];
        if (a >= 0 && b >= 0) {
          // Saddle: turn clockwise, which keeps to the pixel this edge came around.
          const ax = (a % W) - (cur % W);
          const ay = Math.floor(a / W) - Math.floor(cur / W);
          to = dx * ay - dy * ax > 0 ? a : b;
        } else to = a >= 0 ? a : b;
        if (to < 0) break; // malformed mask boundary; cannot happen for a closed lattice
        if (nextA[cur] === to) nextA[cur] = -1;
        else nextB[cur] = -1;
        const ndx = (to % W) - (cur % W);
        const ndy = Math.floor(to / W) - Math.floor(cur / W);
        if (ndx !== dx || ndy !== dy) push(pts, cur, W);
        prev = cur;
        cur = to;
      }
      // Drop the start vertex when the loop runs straight through it.
      const loop = Int32Array.from(pts);
      loops.push(straightenStart(loop));
    }
  }
  return loops;
}

function push(pts: number[], v: number, W: number) {
  pts.push(v % W, Math.floor(v / W));
}

function straightenStart(loop: Int32Array): Int32Array {
  const n = loop.length / 2;
  if (n < 3) return loop;
  const [px, py] = [loop[(n - 1) * 2], loop[(n - 1) * 2 + 1]];
  const [cx, cy] = [loop[0], loop[1]];
  const [nx, ny] = [loop[2], loop[3]];
  const collinear = (cx - px) * (ny - cy) - (cy - py) * (nx - cx) === 0;
  return collinear ? loop.slice(2) : loop;
}

/** Signed area of a lattice loop (positive for clockwise on screen, i.e. outer boundaries). */
export function loopArea(loop: Int32Array): number {
  let a = 0;
  const n = loop.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += loop[i * 2] * loop[j * 2 + 1] - loop[j * 2] * loop[i * 2 + 1];
  }
  return a / 2;
}
