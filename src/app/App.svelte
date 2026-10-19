<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmHost from '$lib/ui/ConfirmHost.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import TooltipHost from '$lib/ui/TooltipHost.svelte';
  import { reportError } from '$lib/ui/errors';
  import StartScreen from './start/StartScreen.svelte';
  import Workspace from './workspace/Workspace.svelte';
  import HelpPage from './pages/HelpPage.svelte';
  import AboutPage from './pages/AboutPage.svelte';
  import Tour from './tour/Tour.svelte';
  import Dialogs from './dialogs/Dialogs.svelte';
  import PrintSheet from './print/PrintSheet.svelte';
  import DropZone from './workspace/DropZone.svelte';
  import { editor } from './state/editor.svelte';
  import { preferences } from './state/preferences.svelte';
  import { profiles } from './state/profiles.svelte';
  import { route } from './state/route.svelte';
  import { session } from './state/session.svelte';
  import { hasSeenTour } from './state/tour';
  import { ui } from './state/ui.svelte';
  import { installShortcuts } from './shortcuts';
  import { installLaunchQueue, installPwa } from './pwa.svelte';
  import { machine } from './state/machine.svelte';

  let ready = $state(false);

  // Theme: 'system' leaves the root unset so tokens.css follows prefers-color-scheme.
  $effect(() => {
    const theme = preferences.value.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  $effect(() => session.schedule(editor.project));

  $effect(() => {
    const name = editor.project?.name ?? editor.gcode?.name;
    document.title = name ? `${name} · openlaser` : 'openlaser · Laser control in your browser';
  });

  onMount(() => {
    const uninstall = installShortcuts();
    void (async () => {
      try {
        await Promise.all([preferences.load(), profiles.load(), session.refreshRecents()]);
        const restored = await session.restorable();
        if (restored) {
          editor.open(restored);
          session.markSaved(restored);
        }
      } catch (error) {
        reportError(error, 'Startup');
      } finally {
        ready = true;
        ui.tourOpen = !hasSeenTour();
        installPwa();
        installLaunchQueue();
      }
    })();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (machine.jobActive) {
        machine.pauseForUnload();
        event.preventDefault();
      } else if (editor.project) {
        void session.flush();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      uninstall();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });
</script>

{#if ready}
  <div class="app" class:hidden={route.page !== 'app'}>
    <ErrorBoundary name="openlaser">
      {#if editor.hasDocument}
        <Workspace />
      {:else}
        <StartScreen />
      {/if}
    </ErrorBoundary>
  </div>

  {#if route.page === 'help'}
    <ErrorBoundary name="Help"><HelpPage /></ErrorBoundary>
  {:else if route.page === 'about'}
    <ErrorBoundary name="About"><AboutPage /></ErrorBoundary>
  {/if}

  <ErrorBoundary name="Dialogs"><Dialogs /></ErrorBoundary>
  <ErrorBoundary name="Tour"><Tour /></ErrorBoundary>
  <DropZone />
  <PrintSheet />
{/if}

<ConfirmHost />
<Toaster />
<TooltipHost />

<style>
  .app {
    height: 100%;
  }

  .hidden {
    display: none;
  }

  @media print {
    .app {
      display: none;
    }
  }
</style>
