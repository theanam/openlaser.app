<script lang="ts">
  import { laserpecker } from './session.svelte';

  const MODES = { engraving: 'Engraving', framing: 'Framing', error: 'Error', idle: 'Idle', unknown: 'Busy' };
  const s = $derived(laserpecker.state);
  const label = $derived(
    laserpecker.connecting
      ? 'Connecting'
      : !laserpecker.connected
        ? 'Offline'
        : s.activity === 'uploading'
          ? 'Sending'
          : s.activity === 'paused'
            ? 'Paused'
            : s.status
              ? MODES[s.status.mode]
              : 'Idle',
  );
  const tone = $derived(
    label === 'Error'
      ? 'alarm'
      : label === 'Engraving' || label === 'Framing' || label === 'Sending'
        ? 'run'
        : label === 'Paused'
          ? 'hold'
          : label === 'Idle'
            ? 'go'
            : 'off',
  );
</script>

<span class="pill badge {tone}" data-testid="lp-state" role="status"><span class="dot"></span>{label}</span>

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
