import { RUIDA_FILES, safeFileName, saveFileAs } from '$lib/storage/files';
import { errorMessage } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { encodeInWorker } from '../../lib/cam-client';
import { baseName } from '../../lib/file-name';
import { editor } from '../../state/editor.svelte';
import { profiles } from '../../state/profiles.svelte';

/** Saves the project as a Ruida .rd job to carry over on a USB stick. */
export async function exportRuida(): Promise<void> {
  const project = editor.project;
  if (!project) {
    toast.info('Open a project to export a job.');
    return;
  }
  try {
    const { payload: bytes, warnings } = await encodeInWorker('ruida', {
      project,
      profile: profiles.active,
      options: undefined,
    });
    const blocking = warnings.find((w) => w.blocking);
    if (blocking || !bytes || bytes.length === 0) {
      toast.warning(blocking?.message ?? 'The job is empty. Turn on output for a layer with objects.');
      return;
    }
    if (warnings.some((w) => w.code === 'out-of-bounds')) toast.warning('Some moves fall outside the bed.');
    const outcome = await saveFileAs(
      safeFileName(baseName(project.name), '.rd'),
      new Blob([bytes.slice()], { type: 'application/octet-stream' }),
      RUIDA_FILES,
      { id: 'rd' },
    );
    if (outcome.status === 'saved')
      toast.success(`Exported ${outcome.handle.name}. Copy it to a USB stick for the laser.`);
    else if (outcome.status === 'downloaded')
      toast.success('Job downloaded. Copy it to a USB stick for the laser.');
    else if (outcome.status === 'failed') toast.error(outcome.reason);
  } catch (error) {
    toast.error(`Could not export: ${errorMessage(error)}`);
  }
}
