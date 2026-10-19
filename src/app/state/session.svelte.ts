/**
 * Autosave (2 s after the last change) and session restore (SPEC §10): reloading the page brings
 * back the project that was open, exactly as it was.
 */
import type { Id, Project } from '$lib/project/types';
import {
  deleteLocalProject,
  getSetting,
  listRecentProjects,
  loadLocalProject,
  saveProjectLocally,
  setSetting,
  type RecentProject,
} from '$lib/storage/db';
import { reportError } from '$lib/ui/errors';
import { projectThumbnail } from '../lib/thumbnail';
import { editor } from './editor.svelte';
import { profiles } from './profiles.svelte';

export const AUTOSAVE_DELAY_MS = 2000;
const OPEN_PROJECT_KEY = 'openProjectId';

class Session {
  recents = $state.raw<RecentProject[]>([]);
  autosave = $state<'idle' | 'pending' | 'saved' | 'error'>('idle');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSaved: Project | null = null;

  async refreshRecents(): Promise<void> {
    this.recents = await listRecentProjects();
  }

  /** Called whenever the open project changes. */
  schedule(project: Project | null): void {
    if (this.timer) clearTimeout(this.timer);
    if (!project || project === this.lastSaved) return;
    this.autosave = 'pending';
    this.timer = setTimeout(() => void this.flush(project), AUTOSAVE_DELAY_MS);
  }

  async flush(project: Project | null = editor.project): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!project) return;
    try {
      const profile = profiles.list.find((p) => p.id === project.machineProfileId) ?? profiles.active;
      await saveProjectLocally(project, projectThumbnail(project, profile));
      await setSetting(OPEN_PROJECT_KEY, project.id);
      this.lastSaved = project;
      this.autosave = 'saved';
      await this.refreshRecents();
    } catch (error) {
      this.autosave = 'error';
      reportError(error, 'Autosave');
    }
  }

  async rememberOpen(id: Id | null): Promise<void> {
    await setSetting(OPEN_PROJECT_KEY, id);
  }

  /** The project that was open when the page last closed, if any. */
  async restorable(): Promise<Project | undefined> {
    const id = await getSetting<Id | null>(OPEN_PROJECT_KEY);
    return id ? loadLocalProject(id) : undefined;
  }

  markSaved(project: Project): void {
    this.lastSaved = project;
  }

  async openRecent(id: Id): Promise<Project | undefined> {
    return loadLocalProject(id);
  }

  async forget(id: Id): Promise<void> {
    await deleteLocalProject(id);
    await this.refreshRecents();
  }
}

export const session = new Session();
