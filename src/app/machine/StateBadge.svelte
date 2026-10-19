<script lang="ts">
  import { machine } from '../state/machine.svelte';

  const label = $derived(
    machine.connecting
      ? 'Connecting'
      : !machine.connected
        ? 'Offline'
        : machine.state.alarm
          ? 'Alarm'
          : machine.state.status,
  );
  const tone = $derived(
    !machine.connected
      ? 'off'
      : machine.state.alarm || label === 'Alarm'
        ? 'alarm'
        : label === 'Run' || label === 'Jog' || label === 'Home'
          ? 'run'
          : label === 'Hold' || label === 'Door'
            ? 'hold'
            : label === 'Idle'
              ? 'go'
              : 'off',
  );
</script>

<span class="pill badge {tone}" data-testid="machine-state" role="status"
  ><span class="dot"></span>{label}</span
>

<style>
  .badge.off {
    background: var(--ol-surface-2);
    color: var(--ol-text-muted);
  }

  .badge.go {
    background: var(--ol-go-tint);
    color: var(--ol-go);
  }

  .badge.hold {
    background: var(--ol-hold-tint);
    color: var(--ol-hold);
  }

  .badge.run {
    background: var(--ol-signal-tint);
    color: var(--ol-signal-text);
  }

  .badge.run .dot {
    background: var(--ol-signal);
  }

  .badge.alarm {
    background: var(--ol-signal);
    color: var(--ol-on-signal);
  }
</style>
