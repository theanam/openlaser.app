<script lang="ts">
  import { connectedSession } from '../machines/registry';

  /** Stops whichever machine is connected. */
  const session = $derived(connectedSession());
  const canStop = $derived(session?.canStop ?? false);
</script>

<!-- Always visible while connected; enabled whenever something is moving, running or held. -->
<button
  type="button"
  class="btn signal cta stop"
  disabled={!canStop}
  title={canStop ? 'Stop now (Esc)' : 'Nothing is running'}
  onclick={() => session?.stop()}
  data-testid="stop"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
    ><rect x="5" y="5" width="14" height="14" rx="2" /></svg
  >
  Stop
  <span class="esc mono">Esc</span>
</button>

<style>
  .stop {
    width: 100%;
  }

  .esc {
    font-size: var(--ol-fs-xs);
    padding: 2px 6px;
    border-radius: var(--ol-radius-xs);
    background: var(--ol-signal-deep);
    opacity: 0.9;
  }
</style>
