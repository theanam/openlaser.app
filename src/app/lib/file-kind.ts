/** What a file is, from its name (and MIME type as a fallback), so each command opens only its own kinds. */
import { PROJECT_EXTENSION } from '$lib/config/app';
import { isGcodeFileName } from '$lib/import/gcode';
import { isImageFileName } from '$lib/import/image';
import { extensionOf } from '$lib/storage/files';

export type FileKindId = 'project' | 'gcode' | 'vector' | 'image';

export function fileKind(name: string, type = ''): FileKindId | null {
  const ext = extensionOf(name);
  if (ext === PROJECT_EXTENSION) return 'project';
  if (isGcodeFileName(name)) return 'gcode';
  if (ext === '.svg' || ext === '.dxf' || type === 'image/svg+xml') return 'vector';
  if (isImageFileName(name) || type.startsWith('image/')) return 'image';
  return null;
}

/** Which command a file belongs to, for the message when it is picked in the wrong one. */
export function commandFor(kind: FileKindId | null): string {
  if (kind === 'project' || kind === 'gcode') return 'Open';
  if (kind === 'vector' || kind === 'image') return 'the Image tool';
  return 'nothing in openlaser';
}

/** First bytes of a project file: a zip archive, or JSON naming the openlaser project format. */
export function looksLikeProject(head: Uint8Array): boolean {
  if (head[0] === 0x50 && head[1] === 0x4b) return true;
  const text = new TextDecoder().decode(head);
  return text.trimStart().startsWith('{') && text.includes('openlaser-project');
}
