/** Shared helpers for objects drawn as outlines: vectors and text. */
import type { PathData, SceneObject, TextObject, VectorObject } from './types';

export type OutlinedObject = VectorObject | TextObject;

export function isOutlined(object: SceneObject): object is OutlinedObject {
  return object.kind === 'vector' || object.kind === 'text';
}

/**
 * Rough size of a text block before its font has loaded, so it can be drawn, picked and moved
 * while the outlines are on their way. Average glyph width ≈ 0.55 em.
 */
export function textPlaceholderSize(text: Pick<TextObject, 'text' | 'fontSize' | 'lineHeight'>): {
  width: number;
  height: number;
} {
  const lines = text.text.split('\n');
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return {
    width: longest * text.fontSize * 0.55,
    height: text.fontSize * (1 + (lines.length - 1) * text.lineHeight),
  };
}

export function pathsOf(object: OutlinedObject): PathData[] {
  return object.paths;
}
