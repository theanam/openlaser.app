/**
 * Local file access (SPEC §10). Uses the File System Access API where it exists (Chrome, Edge), so
 * Save writes straight back to the file on disk. Other browsers get the download / file-input
 * fallback through the same API surface.
 */

export interface OpenedFile {
  name: string;
  file: File;
  /** Present only when the browser supports writing back in place. */
  handle?: FileSystemFileHandle;
}

export interface FileKind {
  description: string;
  /** MIME type → extensions. */
  accept: Record<string, string[]>;
}

export const PROJECT_FILES: FileKind = {
  description: 'openlaser projects',
  accept: { 'application/x-openlaser-project': ['.olaser'] },
};

export const MACHINE_FILES: FileKind = {
  description: 'Machine profiles',
  accept: { 'application/json': ['.json'] },
};

export const VECTOR_FILES: FileKind = {
  description: 'Vector art',
  accept: { 'image/svg+xml': ['.svg'], 'image/vnd.dxf': ['.dxf'] },
};

export const IMAGE_FILES: FileKind = {
  description: 'Images',
  accept: {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'image/avif': ['.avif'],
    'image/bmp': ['.bmp'],
    'image/gif': ['.gif'],
  },
};

export const FONT_FILES: FileKind = {
  description: 'Fonts',
  accept: {
    'font/ttf': ['.ttf'],
    'font/otf': ['.otf'],
    'font/woff': ['.woff'],
    'font/collection': ['.ttc'],
  },
};

export const GCODE_FILES: FileKind = {
  description: 'G-code',
  accept: { 'text/plain': ['.gcode', '.nc', '.gc', '.ngc', '.txt'] },
};

export const supportsFileSystemAccess: boolean =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;
export const supportsFileSystemWrite: boolean = supportsFileSystemAccess && 'showSaveFilePicker' in window;

function acceptString(kinds: FileKind[]): string {
  return kinds.flatMap((k) => [...Object.keys(k.accept), ...Object.values(k.accept).flat()]).join(',');
}

/**
 * Filters for the native picker. It opens on the first filter only, so with several kinds the
 * first one covers all of them; each kind follows as its own filter for narrowing down.
 */
export function pickerTypes(kinds: FileKind[]): FileKind[] {
  if (kinds.length < 2) return kinds.map((k) => ({ description: k.description, accept: k.accept }));
  const accept: Record<string, string[]> = {};
  for (const kind of kinds) {
    for (const [mime, extensions] of Object.entries(kind.accept)) {
      accept[mime] = [...new Set([...(accept[mime] ?? []), ...extensions])];
    }
  }
  return [{ description: kinds.map((k) => k.description).join(' and '), accept }, ...kinds];
}

export async function openFiles(
  kinds: FileKind[],
  options: { multiple?: boolean; id?: string } = {},
): Promise<OpenedFile[]> {
  if (supportsFileSystemAccess) {
    try {
      const handles = await window.showOpenFilePicker!({
        id: options.id,
        multiple: options.multiple ?? false,
        types: pickerTypes(kinds),
        excludeAcceptAllOption: false,
      });
      return Promise.all(
        handles.map(async (handle) => ({ name: handle.name, file: await handle.getFile(), handle })),
      );
    } catch (err) {
      if (isAbort(err)) return [];
      // A sandboxed frame can refuse the picker: fall back to the file input.
      if (!(err instanceof DOMException && err.name === 'SecurityError')) throw err;
    }
  }
  const files = await pickWithInput(acceptString(kinds), options.multiple ?? false);
  return files.map((file) => ({ name: file.name, file }));
}

/** What a save attempt did. Cancelled and downloaded are kept apart so callers never claim a save that did not happen. */
export type SaveOutcome =
  | { status: 'saved'; handle: FileSystemFileHandle }
  | { status: 'downloaded' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export function wroteAFile(outcome: SaveOutcome): boolean {
  return outcome.status === 'saved' || outcome.status === 'downloaded';
}

export async function writeToHandle(handle: FileSystemFileHandle, data: Blob): Promise<boolean> {
  try {
    const permission = await handle.queryPermission?.({ mode: 'readwrite' });
    if (permission !== undefined && permission !== 'granted') {
      const requested = await handle.requestPermission?.({ mode: 'readwrite' });
      if (requested !== 'granted') return false;
    }
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function saveFileAs(
  suggestedName: string,
  data: Blob,
  kind: FileKind,
  options: { id?: string } = {},
): Promise<SaveOutcome> {
  if (supportsFileSystemWrite) {
    let handle: FileSystemFileHandle | undefined;
    try {
      handle = await window.showSaveFilePicker!({
        id: options.id,
        suggestedName,
        types: [{ description: kind.description, accept: kind.accept }],
      });
    } catch (err) {
      if (isAbort(err)) return { status: 'cancelled' };
      // A refused picker still produces a file through the download fallback below.
    }
    if (handle) {
      return (await writeToHandle(handle, data))
        ? { status: 'saved', handle }
        : { status: 'failed', reason: `Could not write to ${handle.name}.` };
    }
  }
  downloadBlob(data, suggestedName);
  return { status: 'downloaded' };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lowercase extension including the dot, or ''. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/** A filesystem-friendly name built from a project name. */
export function safeFileName(name: string, extension: string): string {
  const base =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ') || 'untitled';
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function pickWithInput(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}
