/**
 * Keyboard shortcuts (SPEC §9.6). Browser defaults for these combos (new window, save page, print,
 * open file, zoom) are captured and remapped to app commands. Shortcuts stay out of text fields,
 * except Esc during a job: Stop must be instant wherever focus is.
 */
import { isTypingTarget, matches, ownsArrowKeys } from './lib/keys';
import { editor } from './state/editor.svelte';
import { canvas } from './state/canvas.svelte';
import { machine } from './state/machine.svelte';
import { profiles } from './state/profiles.svelte';
import { route } from './state/route.svelte';
import { ui } from './state/ui.svelte';
import * as actions from './actions';

export interface Shortcut {
  keys: string[];
  label: string;
  group: 'File' | 'Edit' | 'View' | 'Tools' | 'Machine' | 'Help';
  run: () => void;
  /** Fires even while typing in a field. */
  global?: boolean;
  /** Skip (let the browser handle it) when false. */
  when?: () => boolean;
}

const hasProject = () => editor.project !== null;
const designing = () => editor.project !== null && editor.view === 'design';
const hasSelection = () => designing() && editor.selection.size > 0;
const nudgeStep = 1;

function bed() {
  const p = profiles.active;
  return { width: p.bedWidth, height: p.bedHeight, originCorner: p.originCorner };
}

export const SHORTCUTS: Shortcut[] = [
  {
    keys: ['Escape'],
    label: 'Stop the job',
    group: 'Machine',
    global: true,
    when: () => machine.canStop,
    run: () => void machine.stop(),
  },

  { keys: ['Mod+N'], label: 'New project', group: 'File', run: () => actions.newProject() },
  { keys: ['Mod+O'], label: 'Open project or G-code', group: 'File', run: () => void actions.openFile() },
  {
    keys: ['Mod+S'],
    label: 'Save project',
    group: 'File',
    when: hasProject,
    run: () => void actions.saveProject(),
  },
  {
    keys: ['Mod+Shift+S'],
    label: 'Save as',
    group: 'File',
    when: hasProject,
    run: () => void actions.saveProjectAs(),
  },
  { keys: ['Mod+I'], label: 'Import image or SVG', group: 'File', run: () => void actions.importArt() },
  {
    keys: ['Mod+E'],
    label: 'Export G-code',
    group: 'File',
    when: () => editor.hasDocument,
    run: () => void actions.exportGcode(),
  },
  {
    keys: ['Mod+P'],
    label: 'Print template',
    group: 'File',
    when: hasProject,
    run: () => actions.printDesign(),
  },
  {
    keys: ['Shift+T'],
    label: 'Trace image',
    group: 'Edit',
    when: designing,
    run: () => actions.traceSelectedImage(),
  },

  { keys: ['Mod+Z'], label: 'Undo', group: 'Edit', when: hasProject, run: () => editor.undo() },
  {
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    label: 'Redo',
    group: 'Edit',
    when: hasProject,
    run: () => editor.redo(),
  },
  { keys: ['Mod+C'], label: 'Copy', group: 'Edit', when: hasSelection, run: () => actions.copySelection() },
  { keys: ['Mod+X'], label: 'Cut', group: 'Edit', when: hasSelection, run: () => actions.cutSelection() },
  { keys: ['Mod+V'], label: 'Paste', group: 'Edit', when: designing, run: () => actions.paste() },
  {
    keys: ['Mod+D'],
    label: 'Duplicate',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.duplicateSelection(),
  },
  { keys: ['Mod+A'], label: 'Select all', group: 'Edit', when: designing, run: () => editor.selectAll() },
  {
    keys: ['Delete', 'Backspace'],
    label: 'Delete selection',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.deleteSelection(),
  },
  {
    keys: ['ArrowLeft'],
    label: 'Nudge 1 mm (Shift: 10 mm)',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(-nudgeStep, 0),
  },
  {
    keys: ['ArrowRight'],
    label: 'Nudge right',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(nudgeStep, 0),
  },
  {
    keys: ['ArrowUp'],
    label: 'Nudge up',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(0, nudgeStep),
  },
  {
    keys: ['ArrowDown'],
    label: 'Nudge down',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(0, -nudgeStep),
  },
  {
    keys: ['Shift+ArrowLeft'],
    label: 'Nudge 10 mm left',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(-10, 0),
  },
  {
    keys: ['Shift+ArrowRight'],
    label: 'Nudge 10 mm right',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(10, 0),
  },
  {
    keys: ['Shift+ArrowUp'],
    label: 'Nudge 10 mm up',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(0, 10),
  },
  {
    keys: ['Shift+ArrowDown'],
    label: 'Nudge 10 mm down',
    group: 'Edit',
    when: hasSelection,
    run: () => actions.nudge(0, -10),
  },
  {
    keys: ['Escape'],
    label: 'Clear selection',
    group: 'Edit',
    when: () => editor.selection.size > 0 || canvas.measure !== null || editor.tool !== 'select',
    run: () => {
      editor.clearSelection();
      canvas.measure = null;
      editor.tool = 'select';
    },
  },

  {
    keys: ['Mod+0', 'Shift+1'],
    label: 'Fit bed',
    group: 'View',
    when: () => editor.hasDocument,
    run: () => canvas.fit(bed()),
  },
  {
    keys: ['Mod+='],
    label: 'Zoom in',
    group: 'View',
    when: () => editor.hasDocument,
    run: () => canvas.zoomBy(1.25),
  },
  {
    keys: ['Mod+-'],
    label: 'Zoom out',
    group: 'View',
    when: () => editor.hasDocument,
    run: () => canvas.zoomBy(0.8),
  },
  {
    keys: ['Shift+2'],
    label: 'Zoom to selection',
    group: 'View',
    when: () => editor.hasDocument,
    run: () => actions.zoomToSelection(),
  },
  {
    keys: ['P'],
    label: 'Switch Design and Preview',
    group: 'View',
    when: hasProject,
    run: () => (editor.view = editor.view === 'design' ? 'preview' : 'design'),
  },

  { keys: ['V'], label: 'Select tool', group: 'Tools', when: designing, run: () => (editor.tool = 'select') },
  {
    keys: ['H'],
    label: 'Pan tool',
    group: 'Tools',
    when: () => editor.hasDocument,
    run: () => (editor.tool = 'pan'),
  },
  {
    keys: ['R'],
    label: 'Rectangle tool',
    group: 'Tools',
    when: designing,
    run: () => (editor.tool = 'rect'),
  },
  {
    keys: ['E'],
    label: 'Ellipse tool',
    group: 'Tools',
    when: designing,
    run: () => (editor.tool = 'ellipse'),
  },
  {
    keys: ['M'],
    label: 'Measure tool',
    group: 'Tools',
    when: () => editor.hasDocument,
    run: () => (editor.tool = 'measure'),
  },

  { keys: ['?'], label: 'Keyboard shortcuts', group: 'Help', run: () => (ui.shortcutsOpen = true) },
  { keys: ['F1'], label: 'Help', group: 'Help', run: () => route.go('help') },
];

/** Shortcuts worth listing (nudge variants collapse into one row). */
export const LISTED_SHORTCUTS = SHORTCUTS.filter((s) => !/^Nudge (right|up|down|10)/.test(s.label));

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

export function handleKeydown(event: KeyboardEvent): boolean {
  const typing = isTypingTarget(event.target);
  const arrowWidget = event.key.startsWith('Arrow') && ownsArrowKeys(event.target);
  for (const shortcut of SHORTCUTS) {
    if (!shortcut.keys.some((k) => matches(event, k))) continue;
    if ((typing || arrowWidget) && !shortcut.global) continue;
    if (!shortcut.global && dialogOpen()) continue;
    if (shortcut.when && !shortcut.when()) continue;
    event.preventDefault();
    event.stopPropagation();
    shortcut.run();
    return true;
  }
  return false;
}

export function installShortcuts(): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented && !(event.key === 'Escape' && machine.canStop)) return;
    handleKeydown(event);
  };
  // Capture phase, so Stop wins over any component handling Escape.
  window.addEventListener('keydown', listener, true);
  return () => window.removeEventListener('keydown', listener, true);
}
