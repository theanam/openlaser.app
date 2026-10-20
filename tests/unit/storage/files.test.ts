import { describe, expect, it } from 'vitest';
import { extensionOf, safeFileName, wroteAFile } from '$lib/storage/files';

describe('file helpers', () => {
  it('reads extensions', () => {
    expect(extensionOf('Art.SVG')).toBe('.svg');
    expect(extensionOf('job.gcode')).toBe('.gcode');
    expect(extensionOf('README')).toBe('');
  });

  it('builds safe file names', () => {
    expect(safeFileName('Coaster set', '.olaser')).toBe('Coaster set.olaser');
    expect(safeFileName('a/b:c', '.olaser')).toBe('a-b-c.olaser');
    expect(safeFileName('  ', '.json')).toBe('untitled.json');
    expect(safeFileName('done.olaser', '.olaser')).toBe('done.olaser');
  });

  it('only counts saved and downloaded as written', () => {
    expect(wroteAFile({ status: 'downloaded' })).toBe(true);
    expect(wroteAFile({ status: 'cancelled' })).toBe(false);
    expect(wroteAFile({ status: 'failed', reason: 'x' })).toBe(false);
  });
});

describe('pickerTypes', () => {
  it('opens on a filter that takes every kind, then lists each kind', async () => {
    const { pickerTypes, VECTOR_FILES, IMAGE_FILES } = await import('$lib/storage/files');
    const types = pickerTypes([VECTOR_FILES, IMAGE_FILES]);
    expect(types).toHaveLength(3);
    const all = Object.values(types[0]!.accept).flat();
    expect(all).toEqual(expect.arrayContaining(['.svg', '.dxf', '.png', '.jpg', '.webp', '.gif']));
    expect(types.slice(1)).toEqual([VECTOR_FILES, IMAGE_FILES]);
  });

  it('merges extensions that share a MIME type and leaves single kinds alone', async () => {
    const { pickerTypes, GCODE_FILES } = await import('$lib/storage/files');
    const a = { description: 'A', accept: { 'text/plain': ['.a'] } };
    expect(pickerTypes([a, GCODE_FILES])[0]!.accept['text/plain']).toEqual(
      expect.arrayContaining(['.a', '.gcode', '.nc']),
    );
    expect(pickerTypes([a])).toEqual([a]);
  });
});
