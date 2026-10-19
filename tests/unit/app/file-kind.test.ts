import { describe, expect, it } from 'vitest';
import { commandFor, fileKind } from '$app/lib/file-kind';

describe('file kinds', () => {
  it('classifies by extension', () => {
    expect(fileKind('coasters.olaser')).toBe('project');
    expect(fileKind('job.NC')).toBe('gcode');
    expect(fileKind('logo.svg')).toBe('vector');
    expect(fileKind('photo.avif')).toBe('image');
    expect(fileKind('notes.pdf')).toBeNull();
  });

  it('falls back to the MIME type', () => {
    expect(fileKind('blob', 'image/svg+xml')).toBe('vector');
    expect(fileKind('blob', 'image/png')).toBe('image');
  });

  it('names the command for each kind', () => {
    expect(commandFor('gcode')).toBe('Open');
    expect(commandFor('vector')).toBe('the Image tool');
    expect(commandFor('image')).toBe('the Image tool');
  });
});

describe('content sniffing for Open', () => {
  it('recognises projects without an extension', async () => {
    const { looksLikeProject } = await import('$app/lib/file-kind');
    expect(looksLikeProject(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true);
    expect(looksLikeProject(new TextEncoder().encode('{"format":"openlaser-project"'))).toBe(true);
    expect(looksLikeProject(new TextEncoder().encode('G90\nG21\n'))).toBe(false);
  });
});
