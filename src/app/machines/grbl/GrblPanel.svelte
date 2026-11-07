<script lang="ts">
  import Plug from '@lucide/svelte/icons/plug';
  import Cpu from '@lucide/svelte/icons/cpu';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import Wind from '@lucide/svelte/icons/wind';
  import Play from '@lucide/svelte/icons/play';
  import { onMount } from 'svelte';
  import { describeAlarm, describeError, isWebSerialSupported } from 'libopenlaser/machine';
  import { duration } from '../../lib/format';
  import { machine } from '../../state/machine.svelte';
  import { profiles } from '../../state/profiles.svelte';
  import ConnectHelpButton from '../../connect/ConnectHelpButton.svelte';
  import ConnectButton from '../../connect/ConnectButton.svelte';
  import JogPad from '../../machine/JogPad.svelte';
  import Overrides from '../../machine/Overrides.svelte';

  /** GRBL in the Machine panel: connect, then alarms, holds, progress, jogging. */
  const serial = isWebSerialSupported();
  let granted = $state(false);

  onMount(() => {
    if (serial) void machine.hasGrantedPort().then((g) => (granted = g));
  });

  const progress = $derived(machine.progress);
  const running = $derived(machine.jobActive);
  const percent = $derived(progress.total ? Math.round((progress.acked / progress.total) * 100) : 0);
  // GRBL locks into Alarm at power-up when homing is enabled, without an alarm code.
  const alarm = $derived(
    machine.state.alarm
      ? describeAlarm(machine.state.alarm.code)
      : machine.connected && machine.state.status === 'Alarm'
        ? {
            code: null,
            name: 'Locked',
            description: '',
            hint: 'Home the machine, or unlock ($X) to move without homing.',
          }
        : null,
  );
  const lineError = $derived(progress.phase === 'error-hold' && progress.error ? progress.error : null);
</script>

{#if !machine.connected}
  <div class="connect">
    <ConnectButton />
    {#if serial && granted}
      <button type="button" class="btn" disabled={machine.connecting} onclick={() => machine.reconnect()}
        ><RotateCw size={14} />Reconnect last port</button
      >
    {/if}
    <button
      type="button"
      class="btn"
      disabled={machine.connecting}
      onclick={() => machine.connect('simulator')}
      data-testid="connect-virtual"
    >
      <Cpu size={16} />Virtual machine
    </button>
    <ConnectHelpButton />
  </div>
{:else}
  <div class="conn">
    {#if machine.transportKind === 'simulator'}<Cpu size={18} />{:else}<Plug size={18} />{/if}
    <div class="conn-text">
      <span class="conn-name"
        >{machine.transportLabel ?? (machine.transportKind === 'simulator' ? 'Virtual machine' : 'USB')}</span
      >
      <span class="mono muted small">
        {machine.state.firmware?.name === 'grbl' ? 'Grbl' : machine.state.firmware?.name}
        {machine.state.firmware?.version} · {profiles.active.baudRate} · RX {machine.handshake?.rxSize ?? 128}
      </span>
    </div>
    <button type="button" class="btn small ghost" onclick={() => machine.disconnect()}>Disconnect</button>
  </div>

  {#if alarm}
    <div class="banner alarm" role="alert" data-testid="alarm-banner">
      <div class="banner-text">
        <strong>{alarm.code === null ? alarm.name : `Alarm ${alarm.code}: ${alarm.name}`}</strong>
        <span>{alarm.hint ?? alarm.description}</span>
      </div>
      <button type="button" class="btn small" onclick={() => machine.unlock()} data-testid="unlock"
        ><LockOpen size={14} />Unlock ($X)</button
      >
    </div>
  {/if}

  {#if !running && (machine.state.status === 'Hold' || machine.state.status === 'Door')}
    <div class="banner hold" role="alert" data-testid="hold-banner">
      <div class="banner-text">
        <strong>{machine.state.status === 'Door' ? 'Safety door open' : 'Machine on hold'}</strong>
        <span>Resume carries on with the queued motion. Clear drops it.</span>
      </div>
      <div class="banner-actions">
        <button type="button" class="btn small" onclick={() => machine.resumeHold()} data-testid="resume-hold"
          ><Play size={13} />Resume</button
        >
        <button
          type="button"
          class="btn small ghost"
          onclick={() => machine.clearHold()}
          data-testid="clear-hold">Clear</button
        >
      </div>
    </div>
  {/if}

  {#if lineError}
    {@const info = describeError(lineError.code)}
    <div class="banner hold" role="alert">
      <div class="banner-text">
        <strong>Line {lineError.lineIndex + 1} failed: {info.name}</strong>
        <span class="mono small">{lineError.line}</span>
        {#if info.hint}<span>{info.hint}</span>{/if}
      </div>
      <button type="button" class="btn small" onclick={() => machine.continueAfterError()}>Continue</button>
    </div>
  {/if}

  {#if running}
    <div class="progress" data-testid="job-progress">
      <div class="bar"><span style="width: {percent}%"></span></div>
      <div class="mono small row">
        <span>{progress.kind === 'frame' ? 'Framing' : 'Job'} {percent}%</span>
        <span class="muted"
          >{duration(progress.elapsedMs / 1000)}{#if progress.remainingMs !== null}
            · {duration(progress.remainingMs / 1000)} left{/if}</span
        >
      </div>
    </div>
    <Overrides />
  {:else}
    <JogPad disabled={running} />
    <div class="tools">
      <button type="button" class="icon-btn sm" aria-label="Unlock ($X)" onclick={() => machine.unlock()}
        ><LockOpen size={15} /></button
      >
      {#if profiles.active.supportsAirAssist}
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Air assist on or off (M8/M9)"
          onclick={() => machine.realtime('flood-toggle')}><Wind size={15} /></button
        >
      {/if}
    </div>
  {/if}
{/if}

<style>
  .connect {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }



  .conn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-bg);
    border: 1px solid var(--ol-border);
  }

  .conn > :global(svg) {
    color: var(--ol-text-muted);
    flex-shrink: 0;
  }

  .conn-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .conn-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  .banner {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
  }

  .banner.alarm {
    background: var(--ol-signal-tint);
    border: 1px solid var(--ol-signal);
  }

  .banner.hold {
    background: var(--ol-hold-tint);
    border: 1px solid var(--ol-hold);
  }

  .banner-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .banner-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: var(--ol-fs-sm);
    line-height: 1.45;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bar {
    height: 6px;
    border-radius: 999px;
    background: var(--ol-border);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--ol-signal);
    transition: width 0.2s;
  }

  .row {
    display: flex;
    justify-content: space-between;
  }

  .tools {
    display: flex;
    gap: 4px;
  }
</style>
