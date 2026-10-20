<script lang="ts">
  import Plug from '@lucide/svelte/icons/plug';
  import Cpu from '@lucide/svelte/icons/cpu';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import LocateFixed from '@lucide/svelte/icons/locate-fixed';
  import Flag from '@lucide/svelte/icons/flag';
  import Wind from '@lucide/svelte/icons/wind';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Play from '@lucide/svelte/icons/play';
  import { onMount } from 'svelte';
  import { describeAlarm, describeError, isWebSerialSupported } from '$lib/machine';
  import { setJobSettings } from '$lib/project/operations';
  import type { JobSettings } from '$lib/project/types';
  import { duration } from '../lib/format';
  import { editor } from '../state/editor.svelte';
  import { machine } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';
  import ConnectHelpButton from '../connect/ConnectHelpButton.svelte';
  import RuidaPanel from './RuidaPanel.svelte';
  import AnchorPicker from '../workspace/AnchorPicker.svelte';
  import JogPad from './JogPad.svelte';
  import Overrides from './Overrides.svelte';
  import StateBadge from './StateBadge.svelte';
  import MachineSwitcher from './MachineSwitcher.svelte';
  import { coord } from '../lib/format';

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
  const jobSettings = $derived(editor.project?.jobSettings ?? null);

  const ORIGINS: Array<{ id: JobSettings['origin']; label: string; hint: string }> = [
    { id: 'absolute', label: 'Absolute', hint: 'Bed coordinates are machine coordinates' },
    { id: 'current-position', label: 'Current', hint: 'Start the job where the laser is now' },
    { id: 'user-origin', label: 'User', hint: 'Start the job at the origin you set' },
  ];

  function setOrigin(patch: Partial<JobSettings>) {
    editor.commit((p) => setJobSettings(p, patch));
  }
  /** Ruida machines take exported files; there is nothing to connect to. */
  const ruida = $derived(profiles.active.controller === 'ruida' && !machine.connected);
</script>

<section class="machine" aria-label="Machine" data-testid="machine-panel">
  <div class="head">
    <h2>Machine</h2>
    <StateBadge />
  </div>

  <MachineSwitcher />

  {#if ruida}
    <RuidaPanel />
  {:else if !machine.connected}
    <div class="connect">
      {#if serial}
        <button
          type="button"
          class="btn signal cta"
          disabled={machine.connecting}
          onclick={() => machine.connect('webserial')}
        >
          <Plug size={16} />Connect laser
        </button>
        {#if granted}
          <button type="button" class="btn" disabled={machine.connecting} onclick={() => machine.reconnect()}
            ><RotateCw size={14} />Reconnect last port</button
          >
        {/if}
      {:else}
        <p class="note"><TriangleAlert size={14} />Machine control needs Chrome or Edge.</p>
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
          >{machine.transportLabel ??
            (machine.transportKind === 'simulator' ? 'Virtual machine' : 'USB')}</span
        >
        <span class="mono muted small">
          {machine.state.firmware?.name === 'grbl' ? 'Grbl' : machine.state.firmware?.name}
          {machine.state.firmware?.version} · {profiles.active.baudRate} · RX {machine.handshake?.rxSize ??
            128}
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
          <button
            type="button"
            class="btn small"
            onclick={() => machine.resumeHold()}
            data-testid="resume-hold"><Play size={13} />Resume</button
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

  {#if jobSettings && !running && !ruida}
    <div class="origin-block" data-testid="job-origin">
      <div class="origin-head">
        <h3>Job origin</h3>
        {#if jobSettings.origin === 'user-origin' && jobSettings.userOrigin}
          <span class="mono muted small"
            >{coord(jobSettings.userOrigin.x)}, {coord(jobSettings.userOrigin.y)}</span
          >
        {/if}
      </div>
      <div class="origin">
        <div class="segmented" role="group" aria-label="Job origin">
          {#each ORIGINS as o (o.id)}
            <button
              type="button"
              aria-pressed={jobSettings.origin === o.id}
              title={o.hint}
              onclick={() => setOrigin({ origin: o.id })}>{o.label}</button
            >
          {/each}
        </div>
        {#if jobSettings.origin !== 'absolute'}
          <AnchorPicker
            size="md"
            label="Job anchor"
            value={jobSettings.anchor}
            onchange={(a) => setOrigin({ anchor: a })}
          />
        {/if}
      </div>
      <div class="origin-actions">
        <button
          type="button"
          class="btn small"
          disabled={!machine.connected || running}
          title="Use the laser's current position as the job origin"
          onclick={() => machine.setUserOriginHere()}
          data-testid="set-origin"><Flag size={14} />Set origin here</button
        >
        <button
          type="button"
          class="btn small"
          disabled={!machine.connected || running}
          title="Move the laser to the job origin with the laser off"
          onclick={() => machine.goToOrigin()}><LocateFixed size={14} />Go to origin</button
        >
      </div>
    </div>
  {/if}
</section>

<style>
  .machine {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex-grow: 1;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .connect {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note {
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
    line-height: 1.5;
  }

  .note {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--ol-hold);
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

  .origin-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--ol-border);
  }

  .origin-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-sm);
    font-weight: 600;
    color: var(--ol-text-2);
  }

  .origin-actions {
    display: flex;
    gap: 6px;
  }

  .origin-actions .btn {
    flex: 1;
  }

  .origin {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .origin .segmented {
    flex: 1;
  }
</style>
