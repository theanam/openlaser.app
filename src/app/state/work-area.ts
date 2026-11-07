/** The bed as the open job sees it: the fitted accessory's work area, else the machine bed. */
import { workArea } from 'libopenlaser/project';
import { editor } from './editor.svelte';
import { profiles } from './profiles.svelte';

export function currentBed(): { width: number; height: number; originCorner: 'bl' | 'tl' | 'tr' | 'br' } {
  const p = profiles.active;
  return { ...workArea(p, editor.project?.jobSettings), originCorner: p.originCorner };
}
