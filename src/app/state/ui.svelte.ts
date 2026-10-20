/** Which overlays are open. Kept apart from the editor so dialogs never touch project state directly. */
import type { DxfDrawing } from '$lib/import/dxf';
import type { SvgImportResult } from '$lib/import/svg';

/** An SVG or DXF waiting in the import dialog for its color → layer choices. */
export type PendingVectorImport =
  | { format: 'svg'; fileName: string; text: string; result: SvgImportResult }
  | { format: 'dxf'; fileName: string; drawing: DxfDrawing };

class Ui {
  tourOpen = $state(false);
  profilesOpen = $state(false);
  preferencesOpen = $state(false);
  deviceSettingsOpen = $state(false);
  shortcutsOpen = $state(false);
  /** “Laser not showing up?” walkthrough. */
  connectHelpOpen = $state(false);
  vectorImport = $state.raw<PendingVectorImport | null>(null);
  printOpen = $state(false);
  /** Image being traced, when the Trace dialog is open. */
  traceImageId = $state<string | null>(null);
  /** Layer under the pointer in the Layers panel; its objects glow on the bed. */
  hoverLayerId = $state<string | null>(null);
  /** Set while the browser print runs, so the print sheet renders. */
  printing = $state(false);
  print = $state<{ scale: 'actual' | 'fit' }>({ scale: 'actual' });
}

export const ui = new Ui();
