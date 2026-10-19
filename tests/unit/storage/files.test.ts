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
