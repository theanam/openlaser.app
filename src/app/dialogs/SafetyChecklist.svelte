<script lang="ts">
  import { Dialog } from 'bits-ui';
  import Check from '@lucide/svelte/icons/check';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Scan from '@lucide/svelte/icons/scan';
  import Play from '@lucide/svelte/icons/play';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Ruler from '@lucide/svelte/icons/ruler';
  import Timer from '@lucide/svelte/icons/timer';
  import Zap from '@lucide/svelte/icons/zap';
  import Layers from '@lucide/svelte/icons/layers';
  import { duration } from '../lib/format';
  import { machine, type SafetyChoice } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';
  import HazardArt, { type Hazard } from './safety/HazardArt.svelte';

  const BASE_HAZARDS: Array<{ id: Hazard; title: string; text: string }> = [
    {
      id: 'eyes',
      title: 'Laser safety glasses on',
      text: 'Rated for your laser’s wavelength. Reflections blind instantly.',
    },
    { id: 'fumes', title: 'Smoke is extracted', text: 'Ventilate the room. Never cut PVC or vinyl.' },
    {
      id: 'attend',
      title: 'I’ll stay with the laser',
      text: 'Watch the whole job. Flare-ups happen in seconds.',
    },
    {
      id: 'fire',
      title: 'Extinguisher within reach',
      text: 'CO₂ extinguisher or fire blanket next to the machine.',
    },
  ];

  const WATER = {
    id: 'water' as const,
    title: 'Water cooling running',
    text: 'Coolant flowing through the tube. A dry CO₂ tube cracks in seconds.',
  };
  /** CO₂ tubes need coolant: their machines get a fifth check. */
  const HAZARDS = $derived(profiles.active.laserType === 'co2' ? [...BASE_HAZARDS, WATER] : BASE_HAZARDS);

  const request = $derived(machine.safetyRequest);
  let checked = $state<Partial<Record<Hazard, boolean>>>({});
  let startButton = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (!request) return;
    // Later jobs in a session show the hazards already confirmed: one click to go.
    const pre = !request.firstThisSession;
    checked = Object.fromEntries(HAZARDS.map((h) => [h.id, pre]));
  });

  const ready = $derived(HAZARDS.every((h) => checked[h.id]));
  const remaining = $derived(HAZARDS.filter((h) => !checked[h.id]).length);
  const s = $derived(request?.summary);

  function answer(choice: SafetyChoice) {
    request?.resolve(choice);
  }

  function toggle(id: Hazard) {
    checked = { ...checked, [id]: !checked[id] };
  }
</script>

<Dialog.Root open={request !== null} onOpenChange={(o) => !o && answer('cancel')}>
  <Dialog.Portal>
    <Dialog.Overlay class="ol-dialog-overlay" />
    <Dialog.Content
      class="ol-dialog preflight"
      style="--dialog-w: 720px"
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(e) => {
        if (ready) {
          e.preventDefault();
          startButton?.focus();
        }
      }}
      data-testid="safety-dialog"
    >
      {#if request && s}
        <div class="banner">
          <svg class="sign" viewBox="0 0 48 44" aria-hidden="true">
            <path d="M24 3 46 41H2z" class="sign-tri" />
            <circle cx="24" cy="28" r="6" class="sign-ring" />
            <line x1="24" y1="14" x2="24" y2="24" class="sign-beam" />
            <circle cx="24" cy="28" r="2" class="sign-dot" />
          </svg>
          <div>
            <Dialog.Title class="title">Before the laser fires</Dialog.Title>
            <Dialog.Description class="lead"
              >This job burns at up to {s.maxPower}% power. Laser light blinds instantly and burning material
              can catch fire.</Dialog.Description
            >
          </div>
        </div>

        <ul class="facts mono" aria-label="Job">
          {#if s.width !== null && s.height !== null}
            <li><Ruler size={14} />{s.width.toFixed(1)} × {s.height.toFixed(1)} mm</li>
          {/if}
          {#if s.estimatedSeconds !== null}<li><Timer size={14} />~{duration(s.estimatedSeconds)}</li>{/if}
          <li class:hot={s.maxPower >= 80}><Zap size={14} />{s.maxPower}% max</li>
          {#if s.layers !== null}<li>
              <Layers size={14} />{s.layers}
              {s.layers === 1 ? 'layer' : 'layers'}
            </li>{/if}
          <li class="name">{s.name}</li>
        </ul>

        {#if request.framed}
          <div class="frame ok">
            <CircleCheck size={18} /><span>Framed. The outline was traced on the material.</span>
          </div>
        {:else}
          <div class="frame todo" role="note">
            <TriangleAlert size={18} />
            <span>Not framed yet. Trace the outline first to check placement.</span>
            <button type="button" class="btn small" onclick={() => answer('frame')} data-testid="safety-frame"
              ><Scan size={14} />Frame first</button
            >
          </div>
        {/if}

        <div class="hazards" role="group" aria-label="Safety checks">
          {#each HAZARDS as h (h.id)}
            <button
              type="button"
              role="checkbox"
              aria-checked={checked[h.id] === true}
              class="hazard"
              onclick={() => toggle(h.id)}
              data-testid="safety-check"
            >
              <HazardArt hazard={h.id} />
              <span class="text">
                <strong>{h.title}</strong>
                <span>{h.text}</span>
              </span>
              <span class="box" aria-hidden="true"
                >{#if checked[h.id]}<Check size={14} strokeWidth={3} />{/if}</span
              >
            </button>
          {/each}
        </div>

        <footer class="foot">
          <span class="hint">
            {#if ready}
              {request.firstThisSession ? 'All set.' : 'Confirmed earlier this session.'} Stop is
              <span class="kbd">Esc</span> at any time.
            {:else}
              Tick {remaining} more {remaining === 1 ? 'check' : 'checks'} to start.
            {/if}
          </span>
          <button type="button" class="btn" onclick={() => answer('cancel')}>Cancel</button>
          <button
            type="button"
            class="btn start cta"
            bind:this={startButton}
            disabled={!ready}
            onclick={() => answer('start')}
            data-testid="safety-confirm"><Play size={14} />Start job</button
          >
        </footer>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.preflight) {
    padding: 0;
    overflow: hidden;
  }

  .banner {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 18px 20px;
    background: var(--ol-signal-tint);
    border-bottom: 2px solid var(--ol-signal);
  }

  .sign {
    width: 48px;
    height: 44px;
    flex-shrink: 0;
  }

  .sign-tri {
    fill: var(--ol-hold);
    stroke: var(--ol-bg);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .sign-ring {
    fill: none;
    stroke: var(--ol-bg);
    stroke-width: 2.5;
  }

  .sign-beam {
    stroke: var(--ol-signal);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .sign-dot {
    fill: var(--ol-signal);
  }

  .banner :global(.title) {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .banner :global(.lead) {
    margin: 4px 0 0;
    color: var(--ol-text-2);
    line-height: 1.45;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 16px 20px 0;
    padding: 0;
    list-style: none;
    font-size: var(--ol-fs-sm);
  }

  .facts li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--ol-surface-2);
    color: var(--ol-text-2);
  }

  .facts li :global(svg) {
    color: var(--ol-text-muted);
  }

  .facts li.hot {
    background: var(--ol-signal-tint);
    color: var(--ol-signal-text);
  }

  .facts li.hot :global(svg) {
    color: var(--ol-signal);
  }

  .facts .name {
    font-family: var(--ol-font);
    color: var(--ol-text-muted);
    background: none;
  }

  .frame {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 20px 0;
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
  }

  .frame span {
    flex: 1;
  }

  .frame.ok {
    background: var(--ol-go-tint);
    color: var(--ol-text-2);
  }

  .frame.ok :global(svg) {
    color: var(--ol-go);
  }

  .frame.todo {
    background: var(--ol-hold-tint);
    border: 1px solid var(--ol-hold);
  }

  .frame.todo :global(svg:first-child) {
    color: var(--ol-hold);
  }

  .hazards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 16px 20px;
  }

  .hazard {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 8px;
    border-radius: var(--ol-radius-lg);
    border: 1.5px solid var(--ol-border);
    background: var(--ol-bg);
    text-align: left;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .hazard:hover {
    border-color: var(--ol-border-strong);
  }

  .hazard[aria-checked='true'] {
    border-color: var(--ol-go);
    background: var(--ol-go-tint);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: var(--ol-fs-sm);
    line-height: 1.35;
    color: var(--ol-text-muted);
  }

  .text strong {
    font-size: var(--ol-fs-md);
    color: var(--ol-text);
    font-weight: 600;
  }

  .box {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1.5px solid var(--ol-border-strong);
    color: var(--ol-bg);
  }

  .hazard[aria-checked='true'] .box {
    background: var(--ol-go);
    border-color: var(--ol-go);
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px 16px;
    border-top: 1px solid var(--ol-border);
  }

  .hint {
    flex: 1;
    color: var(--ol-text-muted);
    font-size: var(--ol-fs-sm);
  }

  @media (max-width: 640px) {
    .hazards {
      grid-template-columns: 1fr;
    }
  }
</style>
