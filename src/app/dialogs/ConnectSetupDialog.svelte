<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import { autoConnect } from '../machines/connect.svelte';
  import { ui } from '../state/ui.svelte';
  import SetupSteps from '../connect/SetupSteps.svelte';
  import { setupGuide } from '../connect/setup-guide';

  const blocker = $derived(ui.connectSetup);
  const guide = $derived(blocker ? setupGuide(blocker) : null);
  const scheme = $derived(blocker?.kind === 'flag' ? blocker.address.split('://')[0] : 'chrome');

  let open = $derived(blocker !== null);

  function close() {
    ui.connectSetup = null;
  }

  function retry() {
    close();
    void autoConnect.connect('bluetooth');
  }
</script>

{#if guide}
  <Dialog
    bind:open
    title={guide.title}
    description={guide.lead}
    width={560}
    onclose={close}
    testid="connect-setup"
  >
    <SetupSteps steps={guide.steps} {scheme} />
    {#snippet footer()}
      {#if guide.retry}
        <button type="button" class="btn" onclick={close}>Close</button>
        <button type="button" class="btn signal" onclick={retry} data-testid="connect-setup-retry"
          ><RotateCw size={15} />Try again</button
        >
      {:else}
        <button type="button" class="btn signal" onclick={close} data-testid="connect-setup-done">Done</button
        >
      {/if}
    {/snippet}
  </Dialog>
{/if}
