/**
 * IndexedDB persistence (SPEC §10): autosaved projects, recent list, machine profiles and
 * preferences. Blobs are stored natively, so project assets need no encoding here.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Id, MachineProfile, Project } from '../project/types';
import { normalizePreferences, type Preferences } from './preferences';

export interface RecentProject {
  id: Id;
  name: string;
  updatedAt: string;
  layerCount: number;
  objectCount: number;
  /** Small SVG preview of the bed. */
  thumbnail: string;
}

interface OpenLaserDB extends DBSchema {
  projects: { key: Id; value: Project };
  recents: { key: Id; value: RecentProject; indexes: { updatedAt: string } };
  profiles: { key: Id; value: MachineProfile };
  settings: { key: string; value: unknown };
}

const DB_NAME = 'openlaser';
const DB_VERSION = 1;
export const RECENT_LIMIT = 12;

let dbPromise: Promise<IDBPDatabase<OpenLaserDB>> | null = null;

export function database(): Promise<IDBPDatabase<OpenLaserDB>> {
  dbPromise ??= openDB<OpenLaserDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('recents', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('profiles', { keyPath: 'id' });
      db.createObjectStore('settings');
    },
  });
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function resetDatabaseConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function saveProjectLocally(project: Project, thumbnail: string): Promise<void> {
  const db = await database();
  const tx = db.transaction(['projects', 'recents'], 'readwrite');
  await tx.objectStore('projects').put(project);
  await tx.objectStore('recents').put({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    layerCount: project.layers.length,
    objectCount: project.objects.length,
    thumbnail,
  });
  await tx.done;
  await pruneRecents();
}

export async function loadLocalProject(id: Id): Promise<Project | undefined> {
  return (await database()).get('projects', id);
}

export async function deleteLocalProject(id: Id): Promise<void> {
  const db = await database();
  const tx = db.transaction(['projects', 'recents'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('recents').delete(id);
  await tx.done;
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  const all = await (await database()).getAllFromIndex('recents', 'updatedAt');
  return all.reverse();
}

async function pruneRecents(): Promise<void> {
  const recents = await listRecentProjects();
  for (const stale of recents.slice(RECENT_LIMIT)) await deleteLocalProject(stale.id);
}

export async function listProfiles(): Promise<MachineProfile[]> {
  return (await database()).getAll('profiles');
}

export async function saveProfile(profile: MachineProfile): Promise<void> {
  await (await database()).put('profiles', profile);
}

export async function deleteProfile(id: Id): Promise<void> {
  await (await database()).delete('profiles', id);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await database()).get('settings', key) as Promise<T | undefined>;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await database()).put('settings', value, key);
}

export async function loadPreferences(): Promise<Preferences> {
  return normalizePreferences(await getSetting('preferences'));
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await setSetting('preferences', preferences);
}
