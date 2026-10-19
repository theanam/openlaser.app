/**
 * Service worker registration (SPEC §10): offline after the first load, and an "update available"
 * toast when a new version is waiting. Reloading never happens while a job runs.
 */
import { registerSW } from 'virtual:pwa-register';
import { reportError } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { importFiles } from './actions';
import { machine } from './state/machine.svelte';

class PwaState {
  offlineReady = $state(false);
  updateReady = $state(false);
}

export const pwa = new PwaState();

let update: ((reload?: boolean) => Promise<void>) | null = null;

function offerUpdate(): void {
  toast.info('A new version of openlaser is ready.', {
    duration: 0,
    action: {
      label: 'Reload',
      run: () => {
        if (machine.jobActive) {
          toast.warning('Reload after the job finishes.');
          return;
        }
        void update?.(true);
      },
    },
  });
}

export function installPwa(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  try {
    update = registerSW({
      onNeedRefresh() {
        pwa.updateReady = true;
        offerUpdate();
      },
      onOfflineReady() {
        pwa.offlineReady = true;
      },
      onRegisteredSW(_url, registration) {
        if (registration?.active) pwa.offlineReady = true;
      },
      onRegisterError(error) {
        reportError(error, 'Service worker');
      },
    });
  } catch (error) {
    reportError(error, 'Service worker');
  }
}

/** Files opened with the installed app (file handlers in the manifest). */
export function installLaunchQueue(): void {
  window.launchQueue?.setConsumer(async (params) => {
    const files = await Promise.all(
      params.files.map(async (handle) => ({ file: await handle.getFile(), handle })),
    );
    if (files.length) await importFiles(files);
  });
}
