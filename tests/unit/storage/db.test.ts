import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, defaultMachineProfile } from '$lib/project/factory';
import {
  deleteProfile,
  listProfiles,
  listRecentProjects,
  loadLocalProject,
  loadPreferences,
  RECENT_LIMIT,
  resetDatabaseConnection,
  saveProfile,
  saveProjectLocally,
  savePreferences,
} from '$lib/storage/db';
import { defaultPreferences } from '$lib/storage/preferences';

beforeEach(async () => {
  await resetDatabaseConnection();
  indexedDB.deleteDatabase('openlaser');
});

describe('IndexedDB storage', () => {
  it('saves and restores a project with its recent entry', async () => {
    const project = createProject({ name: 'Walnut sign' });
    await saveProjectLocally(project, '<svg/>');
    expect((await loadLocalProject(project.id))?.name).toBe('Walnut sign');
    const recents = await listRecentProjects();
    expect(recents[0]).toMatchObject({ id: project.id, name: 'Walnut sign', thumbnail: '<svg/>' });
  });

  it('lists recents newest first and prunes old ones', async () => {
    for (let i = 0; i < RECENT_LIMIT + 3; i++) {
      const project = createProject({
        name: `p${i}`,
        now: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      });
      await saveProjectLocally(project, '');
    }
    const recents = await listRecentProjects();
    expect(recents).toHaveLength(RECENT_LIMIT);
    expect(recents[0].name).toBe(`p${RECENT_LIMIT + 2}`);
  });

  it('stores machine profiles', async () => {
    const profile = defaultMachineProfile({ name: 'Garage laser' });
    await saveProfile(profile);
    expect(await listProfiles()).toEqual([profile]);
    await deleteProfile(profile.id);
    expect(await listProfiles()).toEqual([]);
  });

  it('round-trips preferences with defaults for missing fields', async () => {
    expect(await loadPreferences()).toEqual(defaultPreferences());
    await savePreferences({ ...defaultPreferences(), theme: 'light' });
    expect((await loadPreferences()).theme).toBe('light');
  });
});
