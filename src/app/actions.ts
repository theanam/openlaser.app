/**
 * User-level commands shared by buttons, menus, shortcuts and drag-and-drop. Each one reports its
 * outcome with a toast instead of throwing.
 */
import { PROJECT_EXTENSION } from '$lib/config/app';
import { multiply, translation } from '$lib/geometry/mat2d';
import { decodeImage, defaultImageSize, readImageDpi, sniffImageMime } from '$lib/import/image';
import { parseDxf } from '$lib/import/dxf';
import {
  importSvg,
  buildProjectObjectsFromSvg,
  type SvgColorGroup,
  type SvgImportResult,
} from '$lib/import/svg';
import { makeId } from '$lib/project/ids';
import { addLayer, addObjects } from '$lib/project/operations';
import { deserializeProject, serializeProject } from '$lib/project/serialize';
import type { Asset, Id, ImageObject, SceneObject } from '$lib/project/types';
import {
  IMAGE_FILES,
  VECTOR_FILES,
  type FileKind,
  GCODE_FILES,
  RUIDA_FILES,
  PROJECT_FILES,
  extensionOf,
  openFiles,
  safeFileName,
  saveFileAs,
  writeToHandle,
} from '$lib/storage/files';
import { errorMessage, reportError } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { compileRdInWorker, parseGcodeInWorker } from './lib/cam-client';
import { placeCentered } from './lib/placement';
import { commandFor, fileKind, looksLikeProject, type FileKindId } from './lib/file-kind';
import { boundsOf } from './lib/selection';
import { canvas } from './state/canvas.svelte';
import { editor } from './state/editor.svelte';
import { machine } from './state/machine.svelte';
import { preview } from './state/preview.svelte';
import { profiles } from './state/profiles.svelte';
import { session } from './state/session.svelte';
import { ui } from './state/ui.svelte';

function bedFrame() {
  const p = profiles.active;
  return { width: p.bedWidth, height: p.bedHeight, originCorner: p.originCorner };
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

// ------------------------------------------------------------------ documents

export function newProject(name?: string): void {
  if (editor.project) void session.flush();
  editor.newProject(profiles.active.id, name);
  preview.reset();
  canvas.fit(bedFrame());
}

export function closeDocument(): void {
  if (editor.project) void session.flush();
  editor.close();
  preview.reset();
  void session.rememberOpen(null);
  void session.refreshRecents();
}

export async function openRecent(id: Id): Promise<void> {
  try {
    const project = await session.openRecent(id);
    if (!project) {
      toast.error('That project is no longer stored in this browser.');
      await session.forget(id);
      return;
    }
    editor.open(project);
    session.markSaved(project);
    preview.reset();
    canvas.fit(bedFrame());
  } catch (error) {
    toast.error(`Could not open the project: ${errorMessage(error)}`);
  }
}

/** Open: .olaser projects and G-code files. Images (SVG included) come in through the Image tool. */
export async function openFile(): Promise<void> {
  try {
    const [opened] = await openFiles([PROJECT_FILES, GCODE_FILES], { id: 'projects' });
    if (!opened) return;
    const kind = fileKind(opened.name);
    if (kind === 'project' || kind === 'gcode') {
      await importFiles([{ file: opened.file, handle: opened.handle }], ['project', 'gcode']);
      return;
    }
    // A file that lost its extension: projects are zips (or openlaser JSON); anything else is G-code text.
    const head = new Uint8Array(await opened.file.slice(0, 64).arrayBuffer());
    if (looksLikeProject(head)) await openProjectFromFile(opened.file, opened.handle);
    else await openGcodeText(opened.name, await opened.file.text());
  } catch (error) {
    toast.error(`Could not open the file: ${errorMessage(error)}`);
  }
}

async function openProjectFromFile(file: File, handle?: FileSystemFileHandle): Promise<void> {
  const project = await deserializeProject(new Uint8Array(await file.arrayBuffer()));
  if (editor.project) await session.flush();
  editor.open(project, { name: file.name, handle: handle ?? null });
  preview.reset();
  canvas.fit(bedFrame());
  await session.flush(project);
  toast.success(`Opened ${project.name}`);
}

export async function saveProject(): Promise<void> {
  const project = editor.project;
  if (!project) return;
  if (!editor.fileHandle) return saveProjectAs();
  try {
    const bytes = await serializeProject(project);
    const ok = await writeToHandle(
      editor.fileHandle,
      new Blob([bytes as BlobPart], { type: 'application/zip' }),
    );
    if (!ok) return saveProjectAs();
    editor.dirty = false;
    toast.success(`Saved ${editor.fileName ?? project.name}`);
  } catch (error) {
    toast.error(`Could not save: ${errorMessage(error)}`);
  }
}

export async function saveProjectAs(): Promise<void> {
  const project = editor.project;
  if (!project) return;
  try {
    const bytes = await serializeProject(project);
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const outcome = await saveFileAs(safeFileName(project.name, PROJECT_EXTENSION), blob, PROJECT_FILES, {
      id: 'projects',
    });
    if (outcome.status === 'saved') {
      editor.fileHandle = outcome.handle;
      editor.fileName = outcome.handle.name;
      editor.dirty = false;
      toast.success(`Saved ${outcome.handle.name}`);
    } else if (outcome.status === 'downloaded') {
      editor.dirty = false;
      toast.success('Project downloaded');
    } else if (outcome.status === 'failed') {
      toast.error(outcome.reason);
    }
  } catch (error) {
    toast.error(`Could not save: ${errorMessage(error)}`);
  }
}

// ------------------------------------------------------------------ import

async function pickAndImport(kinds: FileKind[], allow: FileKindId[], id: string): Promise<void> {
  try {
    const files = await openFiles(kinds, { multiple: true, id });
    await importFiles(
      files.map((f) => ({ file: f.file, handle: f.handle })),
      allow,
    );
  } catch (error) {
    toast.error(`Could not import: ${errorMessage(error)}`);
  }
}

/** The Image tool, ⌘I and the start screen: SVG and raster images. */
export function importArt(): Promise<void> {
  return pickAndImport([VECTOR_FILES, IMAGE_FILES], ['vector', 'image'], 'art');
}

const ALL_KINDS: FileKindId[] = ['project', 'gcode', 'vector', 'image'];

/**
 * Routes files by kind: projects open, G-code goes to the sender, art is added to the project.
 * `allow` limits what a command takes (drag and drop takes everything).
 */
export async function importFiles(
  files: Array<{ file: File; handle?: FileSystemFileHandle }>,
  allow: FileKindId[] = ALL_KINDS,
): Promise<void> {
  for (const { file, handle } of files) {
    const kind = fileKind(file.name, file.type);
    try {
      if (!kind || !allow.includes(kind)) {
        toast.warning(`${file.name} goes through ${commandFor(kind)}.`);
        continue;
      }
      if (kind === 'project') await openProjectFromFile(file, handle);
      else if (kind === 'gcode') await openGcodeText(file.name, await file.text());
      else if (kind === 'vector') await beginVectorImport(file.name, await file.text());
      else await importImage(file);
    } catch (error) {
      reportError(error, 'Import');
      toast.error(`Could not import ${file.name}: ${errorMessage(error)}`);
    }
  }
}

function ensureProject(nameHint: string): void {
  if (!editor.project) newProject(baseName(nameHint));
}

async function beginVectorImport(fileName: string, text: string): Promise<void> {
  const pending =
    extensionOf(fileName) === '.dxf'
      ? { format: 'dxf' as const, fileName, drawing: parseDxf(text) }
      : { format: 'svg' as const, fileName, text, result: importSvg(text) };
  ensureProject(fileName);
  ui.vectorImport = pending;
}

/** Finishes an SVG or DXF import with the dialog's result and its color → layer id (or 'new') choices. */
export function completeVectorImport(result: SvgImportResult, mapping: Map<SvgColorGroup, Id | 'new'>): void {
  const pending = ui.vectorImport;
  ui.vectorImport = null;
  const project = editor.project;
  if (!pending || !project) return;
  try {
    const byKey = new Map([...mapping].map(([g, id]) => [`${g.kind}:${g.color}`, id]));
    const built = buildProjectObjectsFromSvg(result, project.layers, makeId, {
      name: baseName(pending.fileName),
      layerFor: (group) => {
        const choice = byKey.get(`${group.kind}:${group.color}`);
        return choice && choice !== 'new' ? choice : undefined;
      },
    });
    if (built.objects.length === 0) {
      toast.warning('The drawing has no shapes openlaser can engrave.');
      return;
    }
    const content = boundsOf(built.objects);
    const placement = content ? placeCentered(bedFrame(), content) : translation(0, 0);
    const objects = built.objects.map(
      (o) => ({ ...o, transform: multiply(placement, o.transform) }) as SceneObject,
    );
    editor.commit((p) => {
      let next = p;
      for (const layer of built.layersToAdd) next = addLayer(next, layer);
      return addObjects(next, objects, built.assets);
    });
    editor.select(objects.map((o) => o.id));
    const ignored = Object.entries(result.ignored);
    if (ignored.length) toast.warning(`Skipped: ${ignored.map(([k, n]) => `${n} ${k}`).join(', ')}`);
  } catch (error) {
    toast.error(`Could not import ${pending.fileName}: ${errorMessage(error)}`);
  }
}

export function cancelVectorImport(): void {
  ui.vectorImport = null;
}

async function importImage(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes) ?? file.type;
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const raster = await decodeImage(blob);
  const bed = bedFrame();
  const size = defaultImageSize(raster, readImageDpi(bytes), bed);
  ensureProject(file.name);
  const asset: Asset = {
    id: makeId(),
    mime,
    name: file.name,
    data: blob,
    widthPx: raster.width,
    heightPx: raster.height,
  };
  editor.addOnLayer(
    'image',
    (layerId): ImageObject[] => [
      {
        id: makeId(),
        kind: 'image',
        layerId,
        name: file.name,
        locked: false,
        visible: true,
        // Images stay unrotated (CAM rejects rotation), so only center them.
        transform: translation(bed.width / 2 - size.width / 2, bed.height / 2 - size.height / 2),
        assetId: asset.id,
        width: size.width,
        height: size.height,
      },
    ],
    [asset],
  );
  if (size.clamped) toast.info(`${file.name} was scaled down to fit the bed.`);
}

export async function openGcodeFile(): Promise<void> {
  try {
    const [opened] = await openFiles([GCODE_FILES], { id: 'gcode' });
    if (opened) await openGcodeText(opened.name, await opened.file.text());
  } catch (error) {
    toast.error(`Could not open the G-code file: ${errorMessage(error)}`);
  }
}

export async function openGcodeText(name: string, text: string): Promise<void> {
  const parsed = await parseGcodeInWorker(text, profiles.active.maxS);
  if (editor.project) await session.flush();
  editor.openGcode({ name, lines: parsed.lines, moves: parsed.moves });
  preview.reset();
  if (parsed.moves.bounds) canvas.fitTo(bedFrame(), parsed.moves.bounds);
  if (parsed.longLines.length) {
    toast.warning(`${parsed.longLines.length} lines are 80 characters or longer. GRBL rejects them.`);
  }
}

// ------------------------------------------------------------------ export and print

/** Export: a .rd file for Ruida machines (run from a USB stick), G-code for everything else. */
export function exportJob(): Promise<void> {
  // An opened G-code file stays G-code, whatever the machine.
  return profiles.active.controller === 'ruida' && editor.project ? exportRuida() : exportGcode();
}

async function exportRuida(): Promise<void> {
  const project = editor.project;
  if (!project) {
    toast.info('Open a project to export a job.');
    return;
  }
  try {
    const { bytes, warnings } = await compileRdInWorker({ project, profile: profiles.active });
    const blocking = warnings.find((w) => w.blocking);
    if (blocking || bytes.length === 0) {
      toast.warning(blocking?.message ?? 'The job is empty. Turn on output for a layer with objects.');
      return;
    }
    if (warnings.some((w) => w.code === 'out-of-bounds')) toast.warning('Some moves fall outside the bed.');
    const outcome = await saveFileAs(
      safeFileName(baseName(project.name), '.rd'),
      new Blob([bytes.slice()], { type: 'application/octet-stream' }),
      RUIDA_FILES,
      { id: 'rd' },
    );
    if (outcome.status === 'saved')
      toast.success(`Exported ${outcome.handle.name}. Copy it to a USB stick for the laser.`);
    else if (outcome.status === 'downloaded')
      toast.success('Job downloaded. Copy it to a USB stick for the laser.');
    else if (outcome.status === 'failed') toast.error(outcome.reason);
  } catch (error) {
    toast.error(`Could not export: ${errorMessage(error)}`);
  }
}

async function exportGcode(): Promise<void> {
  try {
    const job = await preview.ensure();
    if (!job) {
      toast.error(preview.error ?? 'Nothing to export yet.');
      return;
    }
    if (job.lines.length === 0) {
      toast.warning('The job is empty. Turn on output for a layer with objects.');
      return;
    }
    if (job.warnings.some((w) => w.code === 'out-of-bounds'))
      toast.warning('Some moves fall outside the bed.');
    const text = job.lines.join('\n') + '\n';
    const outcome = await saveFileAs(
      safeFileName(baseName(job.name), '.gcode'),
      new Blob([text], { type: 'text/plain' }),
      GCODE_FILES,
      { id: 'gcode' },
    );
    if (outcome.status === 'saved') toast.success(`Exported ${outcome.handle.name}`);
    else if (outcome.status === 'downloaded') toast.success('G-code downloaded');
    else if (outcome.status === 'failed') toast.error(outcome.reason);
  } catch (error) {
    toast.error(`Could not export: ${errorMessage(error)}`);
  }
}

export function printDesign(): void {
  if (!editor.project || editor.project.objects.length === 0) {
    toast.info('Add something to the bed to print a template.');
    return;
  }
  ui.printOpen = true;
}

// ------------------------------------------------------------------ editing

export {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  nudge,
  paste,
} from './edit-actions';

export function zoomToSelection(): void {
  const project = editor.project;
  const bounds = project ? boundsOf(project.objects.filter((o) => editor.selection.has(o.id))) : null;
  if (bounds) canvas.fitTo(bedFrame(), bounds);
  else canvas.fit(bedFrame());
}

// ------------------------------------------------------------------ machine

/** Start screen buttons: open a blank project and connect. */
export async function startWithMachine(kind: 'webserial' | 'simulator'): Promise<void> {
  if (!editor.hasDocument) newProject();
  await machine.connect(kind);
}

/** Opens the Trace dialog for the selected image (or the only image when nothing is selected). */
export function traceSelectedImage(): void {
  const project = editor.project;
  if (!project) return;
  const images = project.objects.filter((o) => o.kind === 'image');
  const selected = images.filter((o) => editor.selection.has(o.id));
  const target = selected.length === 1 ? selected[0] : images.length === 1 ? images[0] : null;
  if (!target) {
    toast.info(images.length ? 'Select the image to trace.' : 'Import an image to trace it.');
    return;
  }
  ui.traceImageId = target.id;
}
