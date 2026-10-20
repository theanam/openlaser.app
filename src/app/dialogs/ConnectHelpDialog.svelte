<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import ConnectTroubleshooter from '../connect/ConnectTroubleshooter.svelte';
  import { machine } from '../state/machine.svelte';
  import { ui } from '../state/ui.svelte';
</script>

<Dialog bind:open={ui.connectHelpOpen} title="Laser not showing up?" width={620} testid="connect-help-dialog">
  <ConnectTroubleshooter
    onvirtual={() => {
      ui.connectHelpOpen = false;
      void machine.connect('simulator');
    }}
  />
</Dialog>
