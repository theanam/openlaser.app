<script lang="ts">
  import Bluetooth from '@lucide/svelte/icons/bluetooth';
  import Usb from '@lucide/svelte/icons/usb';
  import Cpu from '@lucide/svelte/icons/cpu';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import NumberField from '$lib/ui/NumberField.svelte';
  import { errorText } from '$lib/machine/laserpecker';
  import { laserpecker } from './session.svelte';
  import ConnectHelpButton from '../../connect/ConnectHelpButton.svelte';
  import ConnectButton from '../../connect/ConnectButton.svelte';
  import { autoConnect } from '../connect.svelte';

  /** LaserPecker engravers: connect over Bluetooth or USB, pick the burn settings, see progress. */
  const s = $derived(laserpecker.state);
  const busy = $derived(laserpecker.state.activity !== 'idle');
  const uploadPercent = $derived(s.uploadTotal ? Math.round((s.uploaded / s.uploadTotal) * 100) : 0);
  const error = $derived(s.status && s.status.errorCode !== 0 ? errorText(s.status.errorCode) : null);
</script>

<div class="lp" data-testid="laserpecker-panel">
  <div class="intro">
    <span class="tile" aria-hidden="true"><Bluetooth size={20} /></span>
    <div>
      <strong>{laserpecker.connected ? (laserpecker.label ?? 'LaserPecker') : 'LaserPecker'}</strong>
      <span class="muted mono small"
        >{laserpecker.connected ? (laserpecker.firmware ?? '') : 'Bluetooth or USB'}</span
      >
    </div>
  </div>

  {#if !laserpecker.connected}
    <div class="connect">
      <ConnectButton />
      {#if !autoConnect.methods.length}
        <p class="note"><TriangleAlert size={14} />Machine control needs Chrome or Edge.</p>
      {/if}
      <button
        type="button"
        class="btn"
        disabled={laserpecker.connecting}
        onclick={() => laserpecker.connect('virtual')}
        data-testid="lp-connect-virtual"><Cpu size={16} />Virtual LaserPecker</button
      >
      <ConnectHelpButton />
    </div>
  {:else}
    <div class="conn">
      {#if laserpecker.link === 'bluetooth'}<Bluetooth size={16} />{:else if laserpecker.link === 'usb'}<Usb
          size={16}
        />{:else}<Cpu size={16} />{/if}
      <span class="mono muted small grow">{s.version?.hardware ?? ''}</span>
      <button type="button" class="btn small ghost" onclick={() => laserpecker.disconnect()}
        >Disconnect</button
      >
    </div>

    {#if error}
      <div class="banner" role="alert" data-testid="lp-error">
        <TriangleAlert size={16} /><span>{error}</span>
      </div>
    {/if}

    {#if s.activity === 'uploading'}
      <div class="progress" data-testid="lp-progress">
        <div class="bar"><span style="width: {uploadPercent}%"></span></div>
        <span class="mono small">Sending {uploadPercent}%</span>
      </div>
    {:else if s.activity === 'engraving' || s.activity === 'paused'}
      <div class="progress" data-testid="lp-progress">
        <div class="bar"><span style="width: {s.progress}%"></span></div>
        <span class="mono small">Engraving {s.progress}%</span>
      </div>
    {/if}

    {#if laserpecker.infrared}
      <div class="grid">
        <NumberField
          label="Frequency"
          hint="Pulse rate of the infrared laser. Auto leaves it to the laser"
          unit={laserpecker.frequency ? 'kHz' : 'auto'}
          min={0}
          max={255}
          value={laserpecker.frequency}
          disabled={busy}
          presets={[0, 26, 30, 40, 50, 60]}
          presetLabel={(v) => (v === 0 ? 'Auto' : `${v} kHz`)}
          onchange={(v, live) => !live && (laserpecker.frequency = v)}
          testid="lp-frequency"
        />
      </div>
    {/if}
    <div class="field">
      <span class="muted small">Resolution</span>
      <div class="segmented" role="group" aria-label="Resolution">
        {#each laserpecker.resolutions as r (r.px)}
          <button
            type="button"
            aria-pressed={laserpecker.resolution.px === r.px}
            disabled={busy}
            title="{Math.round(r.dpi)} dpi"
            onclick={() => (laserpecker.px = r.px)}>{r.label}</button
          >
        {/each}
      </div>
    </div>

    <details class="log">
      <summary class="muted small">Device log</summary>
      <pre class="mono" data-testid="lp-log">{laserpecker.log.slice(-60).join('\n')}</pre>
    </details>
  {/if}
</div>

<style>
  .lp {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .intro {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .intro div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: var(--ol-radius-md);
    background: color-mix(in srgb, var(--ol-beam) 16%, transparent);
    color: var(--ol-beam);
  }

  .connect {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: var(--ol-fs-sm);
    color: var(--ol-hold);
  }

  .conn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-bg);
    border: 1px solid var(--ol-border);
    color: var(--ol-text-muted);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  .banner {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-signal-tint);
    border: 1px solid var(--ol-signal);
    font-size: var(--ol-fs-sm);
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

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .log pre {
    margin: 6px 0 0;
    max-height: 160px;
    overflow: auto;
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-2);
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
