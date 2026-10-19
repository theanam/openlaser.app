import { describe, expect, it } from 'vitest';
import { isOutlined, textPlaceholderSize } from '$lib/project/outline';

describe('outlined objects', () => {
  it('treats vectors and text as outlined', () => {
    expect(isOutlined({ kind: 'vector' } as never)).toBe(true);
    expect(isOutlined({ kind: 'text' } as never)).toBe(true);
    expect(isOutlined({ kind: 'image' } as never)).toBe(false);
  });

  it('estimates a placeholder box for text without outlines', () => {
    const one = textPlaceholderSize({ text: 'Hello', fontSize: 10, lineHeight: 1.2 });
    expect(one.width).toBeCloseTo(27.5);
    expect(one.height).toBe(10);
    expect(textPlaceholderSize({ text: 'Hi\nthere', fontSize: 10, lineHeight: 1.5 }).height).toBe(25);
  });
});
