import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A font that has none of the letters: outlines come back empty but with a real block height.
const outlineText = vi.fn(async () => ({ paths: [], width: 0, height: 17.56, missing: ['আ'] }));
vi.mock('$lib/fonts/outline', () => ({ outlineText, TEXT_OUTLINE_VERSION: 2 }));

const { editor } = await import('$app/state/editor.svelte');
const { textOutlines } = await import('$app/state/text.svelte');
const { toast } = await import('$lib/ui/toasts.svelte');

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
  }
};

describe('text whose font lacks its letters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    outlineText.mockClear();
    editor.newProject(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    editor.close();
  });

  it('stays where it is: no re-outline loop, no drift', async () => {
    const id = textOutlines.create({ x: 10, y: 50 }, { width: 100, height: 100, originCorner: 'tl' }, 'আমার');
    await flush();
    const text = () => editor.project!.objects.find((o) => o.id === id)!;
    const placed = text().transform;
    expect(outlineText).toHaveBeenCalledTimes(1);
    // The app re-checks text after every change; outlined-to-nothing text must not go round again.
    for (let i = 0; i < 10; i++) {
      textOutlines.ensureAll(editor.project!);
      await flush();
    }
    expect(outlineText).toHaveBeenCalledTimes(1);
    expect(text().transform).toEqual(placed);
    expect(text()).toMatchObject({ paths: [], blockHeight: 17.56 });
  });

  it('keeps its top edge when the next outline is empty too', async () => {
    const id = textOutlines.create({ x: 10, y: 50 }, { width: 100, height: 100, originCorner: 'tl' }, 'আমার');
    await flush();
    const before = editor.project!.objects.find((o) => o.id === id)!.transform;
    textOutlines.update(id, { text: 'আমার সোনার' });
    await flush();
    expect(editor.project!.objects.find((o) => o.id === id)!.transform).toEqual(before);
  });

  it('stays quiet and records the letters nothing could draw', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const id = textOutlines.create({ x: 10, y: 50 }, undefined, 'আম');
    await flush();
    expect(warning).not.toHaveBeenCalled();
    expect(editor.project!.objects.find((o) => o.id === id)).toMatchObject({ missingGlyphs: ['আ'] });
  });
});
