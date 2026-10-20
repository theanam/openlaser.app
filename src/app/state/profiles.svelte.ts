/** Machine profiles, persisted in IndexedDB. One profile is active at a time. */
import { defaultMachineProfile } from '$lib/project/factory';
import type { Id, MachineProfile } from '$lib/project/types';
import { deleteProfile, getSetting, listProfiles, saveProfile, setSetting } from '$lib/storage/db';

class Profiles {
  list = $state.raw<MachineProfile[]>([]);
  activeId = $state<Id | null>(null);
  loaded = $state(false);

  get active(): MachineProfile {
    return this.list.find((p) => p.id === this.activeId) ?? this.list[0] ?? FALLBACK;
  }

  async load(): Promise<void> {
    // Profiles saved by older versions gain fields added since, at their defaults.
    let list = (await listProfiles()).map((p) => defaultMachineProfile({ ...p }));
    if (list.length === 0) {
      const profile = defaultMachineProfile();
      await saveProfile(profile);
      list = [profile];
    }
    this.list = list.sort((a, b) => a.name.localeCompare(b.name));
    const stored = await getSetting<Id>('activeProfileId');
    this.activeId = list.some((p) => p.id === stored) ? stored! : list[0].id;
    this.loaded = true;
  }

  async activate(id: Id): Promise<void> {
    this.activeId = id;
    await setSetting('activeProfileId', id);
  }

  async save(profile: MachineProfile): Promise<void> {
    await saveProfile(profile);
    const others = this.list.filter((p) => p.id !== profile.id);
    this.list = [...others, profile].sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(id: Id): Promise<void> {
    if (this.list.length <= 1) return;
    await deleteProfile(id);
    this.list = this.list.filter((p) => p.id !== id);
    if (this.activeId === id) await this.activate(this.list[0].id);
  }
}

const FALLBACK = defaultMachineProfile({ id: 'fallback' });

export const profiles = new Profiles();
