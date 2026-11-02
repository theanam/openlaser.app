import { GCODE_FILES, safeFileName, saveFileAs } from '$lib/storage/files';
import { errorMessage } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { baseName } from '../../lib/file-name';
import { preview } from '../../state/preview.svelte';

/** Saves the compiled job (or the open G-code file) as a .gcode file. */
export async function exportGcode(): Promise<void> {
  try {
    const job = await preview.ensure();
    if (!job) {
      toast.error(preview.error ?? 'Nothing to export yet.');
      return;
    }
    if (job.lines.length === 0) {
      toast.warning('The job is empty. Turn on output for a layer with objects.');
      return;
    }
    if (job.warnings.some((w) => w.code === 'out-of-bounds'))
      toast.warning('Some moves fall outside the bed.');
    const text = job.lines.join('\n') + '\n';
    const outcome = await saveFileAs(
      safeFileName(baseName(job.name), '.gcode'),
      new Blob([text], { type: 'text/plain' }),
      GCODE_FILES,
      { id: 'gcode' },
    );
    if (outcome.status === 'saved') toast.success(`Exported ${outcome.handle.name}`);
    else if (outcome.status === 'downloaded') toast.success('G-code downloaded');
    else if (outcome.status === 'failed') toast.error(outcome.reason);
  } catch (error) {
    toast.error(`Could not export: ${errorMessage(error)}`);
  }
}
