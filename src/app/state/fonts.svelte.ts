/** Every font the picker offers: uploaded files, system fonts (once allowed) and Google Fonts. */
import { loadCatalog, type CatalogFont } from '$lib/fonts/catalog';
import {
  FontFileError,
  loadSystemFonts,
  localFamilies,
  removeUploadedFont,
  restoreUploadedFonts,
  systemFontsGranted,
  systemFontsSupported,
  uploadFont,
} from '$lib/fonts/local';
import { forgetParsedFamily } from '$lib/fonts/outline';
import { FONT_FILES, openFiles } from '$lib/storage/files';
import { errorMessage } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { textOutlines } from './text.svelte';

export type SystemFontsState = 'unsupported' | 'idle' | 'loading' | 'ready' | 'denied';

class Fonts {
  catalog = $state.raw<CatalogFont[]>([]);
  local = $state.raw<CatalogFont[]>([]);
  system = $state<SystemFontsState>('idle');
  private started: Promise<void> | null = null;

  /** Local fonts first, so they win over a Google family of the same name. */
  get all(): CatalogFont[] {
    const mine = new Set(this.local.map((f) => f.family.toLowerCase()));
    return [...this.local, ...this.catalog.filter((f) => !mine.has(f.family.toLowerCase()))];
  }

  /** Loads the catalogue, uploaded fonts and, when already allowed, system fonts. Safe to call often. */
  init(): Promise<void> {
    return (this.started ??= (async () => {
      this.system = systemFontsSupported() ? 'idle' : 'unsupported';
      const catalog = loadCatalog().then((list) => (this.catalog = list));
      await restoreUploadedFonts();
      this.syncLocal();
      if (await systemFontsGranted()) await this.loadSystem();
      await catalog;
    })());
  }

  /** Lists installed fonts; the first call asks the browser for permission. */
  async loadSystem(): Promise<void> {
    if (this.system === 'unsupported' || this.system === 'loading') return;
    this.system = 'loading';
    try {
      const count = await loadSystemFonts();
      this.system = 'ready';
      this.syncLocal();
      if (count === 0) toast.info('No system fonts were shared.');
    } catch (error) {
      this.system = error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'idle';
      if (this.system === 'idle') toast.error(`Could not read system fonts: ${errorMessage(error)}`);
    }
  }

  /** Picks font files and adds them. Returns the last family added, for selecting it. */
  async upload(): Promise<string | null> {
    let last: string | null = null;
    try {
      const files = await openFiles([FONT_FILES], { multiple: true, id: 'fonts' });
      for (const { file } of files) {
        try {
          last = await uploadFont(file);
          forgetParsedFamily(last);
          textOutlines.refreshFamily(last);
        } catch (error) {
          const reason = error instanceof FontFileError ? error.message : errorMessage(error);
          toast.error(`Could not add ${file.name}: ${reason}`);
        }
      }
    } catch (error) {
      toast.error(`Could not open the font: ${errorMessage(error)}`);
    }
    this.syncLocal();
    if (last) toast.success(`Added ${last}`);
    return last;
  }

  async remove(family: string): Promise<void> {
    await removeUploadedFont(family);
    forgetParsedFamily(family);
    this.syncLocal();
    textOutlines.refreshFamily(family);
  }

  private syncLocal(): void {
    const before = new Set(this.local.map((f) => f.family.toLowerCase()));
    this.local = localFamilies();
    // Text waiting on a font that just arrived (a system font allowed after the project opened).
    for (const f of this.local) if (!before.has(f.family.toLowerCase())) textOutlines.refreshFamily(f.family);
  }
}

export const fonts = new Fonts();
