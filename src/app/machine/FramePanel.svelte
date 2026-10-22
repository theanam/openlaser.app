<script lang="ts">
  import Scan from '@lucide/svelte/icons/scan';
  import Repeat from '@lucide/svelte/icons/repeat';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import NumberField from '$lib/ui/NumberField.svelte';
  import { confirm } from '$lib/ui/confirm.svelte';
  import { MAX_FRAME_POWER_PERCENT } from '$lib/project/factory';
  import { machine } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';

  /** Traces the job outline: laser off, or a faint line at up to 5 %, once or until stopped. */
  const profile = $derived(profiles.active);
  const busy = $derived(machine.jobActive && !machine.framing);
  const looping = $derived(machine.framing && machine.frameLoop);

  async function setPower(value: number, live: boolean) {
    if (live) return;
    const next = Math.min(MAX_FRAME_POWER_PERCENT, Math.max(0, value));
    if (next > 0 && profile.framePowerPercent === 0) {
      const ok = await confirm({
        title: 'Fire the laser while framing?',
        message: `The laser traces the outline at ${next}% power. Wear laser safety glasses and keep hands clear.`,
        confirmLabel: 'Frame with the laser on',
        tone: 'danger',
      });
      if (!ok) return;
    }
    await profiles.save({ ...profile, framePowerPercent: next });
  }

  function run() {
    void machine.frame({ loop: machine.frameRepeat });
  }
</script>

<section class="frame" aria-label="Frame" data-testid="frame-panel">
  <div class="head">
    <h3>Frame</h3>
    {#if machine.framing}
      <span class="status mono" role="status">
        <span class="pulse" aria-hidden="true"></span>{looping ? `Pass ${machine.framePass}` : 'Tracing'}
      </span>
    {:else}
      <span class="hint"
        >{profile.framePowerPercent > 0
          ? `Laser on at ${profile.framePowerPercent}%`
          : 'Laser stays off'}</span
      >
    {/if}
  </div>

  <div class="fields">
    <NumberField
      label="Laser"
      hint="Low power while framing so the beam shows where the job goes. 0 keeps it off"
      unit={profile.framePowerPercent > 0 ? '%' : 'off'}
      decimals={1}
      step={0.5}
      min={0}
      max={MAX_FRAME_POWER_PERCENT}
      value={profile.framePowerPercent}
      disabled={machine.framing}
      presets={[0, 0.5, 1, 2, 3, 5]}
      presetLabel={(v) => (v === 0 ? 'Off' : `${v}%`)}
      onchange={(v, live) => void setPower(v, live)}
      testid="frame-power"
    />
    <NumberField
      label="Speed"
      hint="How fast the head traces the job's outline"
      unit="mm/min"
      step={100}
      min={100}
      max={60000}
      value={profile.frameSpeed}
      disabled={machine.framing}
      onchange={(v, live) => !live && void profiles.save({ ...profile, frameSpeed: v })}
      testid="frame-speed"
    />
  </div>

  <div class="actions">
    {#if looping}
      <button
        type="button"
        class="btn main"
        onclick={() => machine.stopFramingLoop()}
        data-testid="frame-stop-loop"
      >
        <CircleStop size={15} />Stop after this pass
      </button>
    {:else}
      <button
        type="button"
        class="btn main"
        disabled={busy || machine.framing}
        onclick={run}
        data-testid="frame"
      >
        <Scan size={15} />{machine.frameRepeat ? 'Frame until stopped' : 'Frame'}
      </button>
    {/if}
    <button
      type="button"
      class="btn repeat"
      aria-pressed={machine.frameRepeat}
      aria-label={machine.frameRepeat ? 'Repeat framing: on' : 'Repeat framing until stopped'}
      disabled={machine.framing}
      onclick={() => (machine.frameRepeat = !machine.frameRepeat)}
      data-testid="frame-repeat"><Repeat size={15} /></button
    >
  </div>
</section>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .hint {
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-beam);
  }

  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ol-beam);
    animation: pulse 1s ease-in-out infinite alternate;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .actions {
    display: flex;
  }

  .main {
    flex: 1;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .repeat {
    width: 40px;
    padding: 0;
    margin-left: -1px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    color: var(--ol-text-muted);
  }

  .repeat[aria-pressed='true'] {
    background: var(--ol-beam);
    border-color: var(--ol-beam);
    color: var(--ol-bg);
  }

  @keyframes pulse {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }
</style>
