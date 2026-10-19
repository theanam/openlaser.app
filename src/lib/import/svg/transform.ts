import { identity, multiply, rotation, scaling, translation } from '../../geometry/mat2d';
import type { Mat2D } from '../../geometry/types';
import { parseNumberList } from './numbers';

const FUNCTION = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Parses an SVG `transform` attribute. Functions compose left to right (the rightmost applies to
 * the element first). SVG's `rotate(a)` matrix is the same as the geometry module's rotation;
 * in SVG's Y-down space it reads as clockwise. Unparseable input yields the identity.
 */
export function parseTransform(text: string | null): Mat2D {
  let result = identity();
  if (!text) return result;
  for (const match of text.matchAll(FUNCTION)) {
    const n = parseNumberList(match[2]);
    let m: Mat2D | null = null;
    switch (match[1]) {
      case 'matrix':
        if (n.length === 6) m = [n[0], n[1], n[2], n[3], n[4], n[5]];
        break;
      case 'translate':
        if (n.length >= 1) m = translation(n[0], n[1] ?? 0);
        break;
      case 'scale':
        if (n.length >= 1) m = scaling(n[0], n[1] ?? n[0]);
        break;
      case 'rotate':
        if (n.length === 1) m = rotation(n[0]);
        else if (n.length >= 3) {
          m = multiply(translation(n[1], n[2]), multiply(rotation(n[0]), translation(-n[1], -n[2])));
        }
        break;
      case 'skewX':
        if (n.length >= 1) m = [1, 0, Math.tan(radians(n[0])), 1, 0, 0];
        break;
      case 'skewY':
        if (n.length >= 1) m = [1, Math.tan(radians(n[0])), 0, 1, 0, 0];
        break;
    }
    if (m) result = multiply(result, m);
  }
  return result;
}
