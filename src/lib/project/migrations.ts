import { PROJECT_SCHEMA_VERSION } from './factory';
import type { Project } from './types';

/**
 * Migrations keyed by the version they upgrade from. `migrations[n]` turns a version-n project
 * into version n+1. Version 1 is the first schema, so the table starts empty.
 */
export const migrations: Record<number, (project: Project) => Project> = {};

export function migrateProject(project: Project): Project {
  let current = project;
  while (current.version < PROJECT_SCHEMA_VERSION) {
    const step = migrations[current.version];
    if (!step) throw new Error(`No migration from project schema ${current.version}.`);
    current = { ...step(current), version: current.version + 1 };
  }
  return current;
}
