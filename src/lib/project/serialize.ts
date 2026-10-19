/**
 * Project files (.olaser): a zip holding `project.json` and `assets/<id>.<ext>`. Plain JSON with
 * base64 assets is also accepted on open, for hand-written or debug files.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { PROJECT_SCHEMA_VERSION } from './factory';
import { migrateProject } from './migrations';
import type { Asset, Project } from './types';

export const PROJECT_FORMAT = 'openlaser-project';

interface AssetEntry {
  id: string;
  mime: string;
  name: string;
  path?: string;
  base64?: string;
  widthPx?: number;
  heightPx?: number;
}

interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  project: Omit<Project, 'assets'>;
  assets: AssetEntry[];
}

export class ProjectFileError extends Error {
  override name = 'ProjectFileError';
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

function assetPath(asset: Asset): string {
  return `assets/${asset.id}.${EXTENSIONS[asset.mime] ?? 'bin'}`;
}

function describeAsset(asset: Asset): Omit<AssetEntry, 'path' | 'base64'> {
  const entry: Omit<AssetEntry, 'path' | 'base64'> = { id: asset.id, mime: asset.mime, name: asset.name };
  if (asset.widthPx !== undefined) entry.widthPx = asset.widthPx;
  if (asset.heightPx !== undefined) entry.heightPx = asset.heightPx;
  return entry;
}

export async function serializeProject(project: Project): Promise<Uint8Array> {
  const { assets, ...rest } = project;
  const files: Zippable = {};
  const entries: AssetEntry[] = [];
  for (const asset of Object.values(assets)) {
    const path = assetPath(asset);
    files[path] = [new Uint8Array(await asset.data.arrayBuffer()), { level: 0 }];
    entries.push({ ...describeAsset(asset), path });
  }
  const manifest: ProjectFile = {
    format: PROJECT_FORMAT,
    version: project.version,
    project: rest,
    assets: entries,
  };
  files['project.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function parseManifest(text: string): ProjectFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file is not a readable openlaser project.');
  }
  const file = parsed as Partial<ProjectFile>;
  if (!file || file.format !== PROJECT_FORMAT || typeof file.project !== 'object') {
    throw new ProjectFileError('This file is not an openlaser project.');
  }
  return file as ProjectFile;
}

export async function deserializeProject(bytes: Uint8Array): Promise<Project> {
  let manifest: ProjectFile;
  let entries: Record<string, Uint8Array> = {};
  if (isZip(bytes)) {
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new ProjectFileError('The project archive is damaged.');
    }
    const json = entries['project.json'];
    if (!json) throw new ProjectFileError('The project archive has no project.json.');
    manifest = parseManifest(strFromU8(json));
  } else {
    manifest = parseManifest(strFromU8(bytes));
  }

  const assets: Record<string, Asset> = {};
  for (const entry of manifest.assets ?? []) {
    const data = entry.path ? entries[entry.path] : entry.base64 ? decodeBase64(entry.base64) : undefined;
    if (!data) throw new ProjectFileError(`The asset "${entry.name}" is missing from the project.`);
    const asset: Asset = {
      id: entry.id,
      mime: entry.mime,
      name: entry.name,
      data: new Blob([data as BlobPart], { type: entry.mime }),
    };
    if (entry.widthPx !== undefined) asset.widthPx = entry.widthPx;
    if (entry.heightPx !== undefined) asset.heightPx = entry.heightPx;
    assets[entry.id] = asset;
  }

  const version = manifest.project.version ?? manifest.version;
  if (typeof version !== 'number') throw new ProjectFileError('The project has no schema version.');
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version of openlaser (schema ${version}). Update the app to open it.`,
    );
  }
  return migrateProject({ ...manifest.project, version, assets } as Project);
}
