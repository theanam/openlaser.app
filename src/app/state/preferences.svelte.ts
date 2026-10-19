import { loadPreferences, savePreferences } from '$lib/storage/db';
import { defaultPreferences, type Preferences } from '$lib/storage/preferences';

class PreferencesState {
  value = $state<Preferences>(defaultPreferences());

  async load(): Promise<void> {
    this.value = await loadPreferences();
  }

  async update(patch: Partial<Preferences>): Promise<void> {
    this.value = { ...this.value, ...patch };
    await savePreferences($state.snapshot(this.value));
  }
}

export const preferences = new PreferencesState();
