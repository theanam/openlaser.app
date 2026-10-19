import type { Pixels } from '$lib/trace/types';

type Paint = { inside(x: number, y: number): boolean; rgba: [number, number, number, number] };

/** Anti-aliased test picture: shapes painted in order over a background, 4×4 supersampled. */
export function picture(w: number, h: number, bg: [number, number, number, number], shapes: Paint[]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          let c = bg;
          for (const s of shapes) if (s.inside(px, py)) c = s.rgba;
          for (let k = 0; k < 4; k++) acc[k] += c[k] / 16;
        }
      data.set(acc, (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

export const disc = (cx: number, cy: number, r: number, rgba: Paint['rgba']): Paint => ({
  inside: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 < r * r,
  rgba,
});

export const box = (x0: number, y0: number, x1: number, y1: number, rgba: Paint['rgba']): Paint => ({
  inside: (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1,
  rgba,
});

/** Even-odd point-in-polygon over flat [x, y, …] loops. */
export function insideLoops(loops: ArrayLike<number>[], x: number, y: number): boolean {
  let inside = false;
  for (const l of loops) {
    const n = l.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = l[i * 2];
      const yi = l[i * 2 + 1];
      const xj = l[j * 2];
      const yj = l[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
