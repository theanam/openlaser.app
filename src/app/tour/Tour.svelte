<script lang="ts">
  import { Dialog } from 'bits-ui';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import X from '@lucide/svelte/icons/x';
  import type { Component } from 'svelte';
  import { defaultMachineProfile } from '$lib/project/factory';
  import {
    MACHINE_PRESETS,
    presetName,
    presetProfileFields,
    type MachinePreset,
  } from '$lib/project/machine-presets';
  import PresetPicker from '../dialogs/PresetPicker.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { markTourSeen } from '../state/tour';
  import { ui } from '../state/ui.svelte';
  import { TOUR_STEPS, type TourArt } from './steps';
  import Welcome from './art/Welcome.svelte';
  import Connect from './art/Connect.svelte';
  import Import from './art/Import.svelte';
  import LayersArt from './art/LayersArt.svelte';
  import Photos from './art/Photos.svelte';
  import Design from './art/Design.svelte';
  import TextShapes from './art/TextShapes.svelte';
  import PreviewArt from './art/PreviewArt.svelte';
  import Run from './art/Run.svelte';
  import Machine from './art/Machine.svelte';
  import Files from './art/Files.svelte';
  import Safety from './art/Safety.svelte';
  import PickMachine from './art/PickMachine.svelte';

  const ART: Record<Exclude<TourArt, 'pick-machine'>, Component> = {
    welcome: Welcome,
    connect: Connect,
    import: Import,
    layers: LayersArt,
    photos: Photos,
    design: Design,
    'text-shapes': TextShapes,
    preview: PreviewArt,
    run: Run,
    machine: Machine,
    files: Files,
    safety: Safety,
  };

  let index = $state(0);
  let nextButton = $state<HTMLButtonElement | null>(null);
  let chosenName = $state<string | null>(null);
  const step = $derived(TOUR_STEPS[index]);
  const last = $derived(index === TOUR_STEPS.length - 1);
  const preset = $derived(
    MACHINE_PRESETS.find((p) => presetName(p) === chosenName) ??
      MACHINE_PRESETS.find((p) => presetName(p) === profiles.active.name) ??
      MACHINE_PRESETS[0],
  );

  $effect(() => {
    if (ui.tourOpen) index = 0;
  });

  async function finish() {
    if (chosenName) {
      const existing = profiles.list.find((p) => p.name === presetName(preset));
      if (existing) await profiles.activate(existing.id);
      else {
        const profile = defaultMachineProfile(presetProfileFields(preset));
        await profiles.save(profile);
        await profiles.activate(profile.id);
      }
    }
    close();
  }

  function close() {
    markTourSeen();
    ui.tourOpen = false;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowRight' && !last) index++;
    if (event.key === 'ArrowLeft' && index > 0) index--;
  }
</script>

<Dialog.Root open={ui.tourOpen} onOpenChange={(open) => !open && close()}>
  <Dialog.Portal>
    <Dialog.Overlay class="ol-dialog-overlay" />
    <Dialog.Content
      class="tour"
      aria-label="Tour of openlaser"
      {onkeydown}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        nextButton?.focus();
      }}
      data-testid="tour"
    >
      <div class="art tour-art" data-theme="dark">
        {#key step.id}
          <div class="art-inner">
            {#if step.art === 'pick-machine'}
              <PickMachine {preset} />
            {:else}
              {@const Art = ART[step.art]}
              <Art />
            {/if}
          </div>
        {/key}
      </div>

      <div class="copy">
        <div class="top">
          <span class="count mono">{index + 1} / {TOUR_STEPS.length}</span>
          <button type="button" class="skip" onclick={close} data-testid="tour-skip"
            ><X size={14} />Skip tour</button
          >
        </div>
        {#key step.id}
          <div class="text">
            <Dialog.Title class="title">{step.title}</Dialog.Title>
            <Dialog.Description class="body">{step.body}</Dialog.Description>
            {#if step.points.length}
              <ul class="points">
                {#each step.points as point (point.text)}
                  <li><span class="icon"><point.icon size={16} /></span>{point.text}</li>
                {/each}
              </ul>
            {/if}
            {#if step.art === 'pick-machine'}
              <PresetPicker
                selected={presetName(preset)}
                onselect={(p: MachinePreset) => (chosenName = presetName(p))}
                height={200}
              />
            {/if}
          </div>
        {/key}

        <div class="nav">
          <div class="dots" role="tablist" aria-label="Tour steps">
            {#each TOUR_STEPS as s, i (s.id)}
              <button
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label="Step {i + 1}: {s.title}"
                class="dot"
                class:on={i === index}
                onclick={() => (index = i)}
              ></button>
            {/each}
          </div>
          <div class="buttons">
            {#if index > 0}
              <button type="button" class="icon-btn" aria-label="Back" onclick={() => index--}
                ><ArrowLeft size={18} /></button
              >
            {/if}
            {#if last}
              <button type="button" class="btn signal" onclick={finish} data-testid="tour-finish"
                >Start using openlaser</button
              >
            {:else}
              <button
                type="button"
                class="btn start"
                bind:this={nextButton}
                onclick={() => index++}
                data-testid="tour-next">Next<ArrowRight size={16} /></button
              >
            {/if}
          </div>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.tour) {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(960px, calc(100vw - 32px));
    height: min(560px, calc(100vh - 32px));
    display: flex;
    border-radius: var(--ol-radius-xl);
    overflow: hidden;
    background: var(--ol-surface);
    border: 1px solid var(--ol-border);
    box-shadow: var(--ol-shadow-pop);
    outline: none;
  }

  .art {
    flex: 1.15;
    background: var(--ol-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    min-width: 0;
  }

  .art-inner {
    width: 100%;
    animation: fade 0.35s ease-out;
  }

  .art-inner :global(svg) {
    width: 100%;
    height: auto;
    display: block;
  }

  .copy {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px 28px;
    gap: 16px;
    min-width: 0;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .count {
    color: var(--ol-text-dim);
    font-size: var(--ol-fs-sm);
  }

  .skip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    color: var(--ol-text-muted);
    padding: 6px 8px;
    border-radius: var(--ol-radius-sm);
  }

  .skip:hover {
    background: var(--ol-surface-2);
    color: var(--ol-text);
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: rise 0.35s ease-out;
    overflow: auto;
  }

  .text :global(.title) {
    margin: 0;
    font-size: 30px;
    line-height: 1.1;
    font-weight: 600;
    letter-spacing: -0.035em;
  }

  .text :global(.body) {
    margin: 0;
    font-size: var(--ol-fs-lg);
    line-height: 1.5;
    color: var(--ol-text-2);
  }

  .points {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .points li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    line-height: 1.45;
    color: var(--ol-text-2);
  }

  .icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    margin-top: -4px;
    border-radius: var(--ol-radius-sm);
    background: var(--ol-surface-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ol-signal);
  }

  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .dots {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border-radius: 999px;
    border: 0;
    background: var(--ol-border-strong);
    transition: width 0.2s;
  }

  .dot.on {
    width: 22px;
    background: var(--ol-signal);
  }

  .buttons {
    display: flex;
    gap: 6px;
  }

  /* Shared illustration styles. */
  .tour-art :global(.bed) {
    fill: var(--ol-bed);
  }

  .tour-art :global(.grid-minor) {
    stroke: var(--ol-grid-minor);
  }

  .tour-art :global(.grid-major) {
    stroke: var(--ol-grid-major);
  }

  .tour-art :global(.panel) {
    fill: var(--ol-surface);
    stroke: var(--ol-border);
  }

  .tour-art :global(.frame-stroke) {
    stroke: var(--ol-border-strong);
  }

  .tour-art :global(.chip) {
    fill: var(--ol-surface-2);
    stroke: var(--ol-border);
  }

  .tour-art :global(.line-fill) {
    fill: var(--ol-border);
  }

  .tour-art :global(.off-fill) {
    fill: var(--ol-anchor-off);
  }

  .tour-art :global(.ring) {
    stroke: var(--ol-text);
  }

  .tour-art :global(.sig) {
    stroke: var(--ol-signal);
  }

  .tour-art :global(.sig-fill) {
    fill: var(--ol-signal);
  }

  .tour-art :global(.beam) {
    stroke: var(--ol-beam);
  }

  .tour-art :global(.beam-fill) {
    fill: var(--ol-beam);
  }

  .tour-art :global(.photo-fill) {
    fill: var(--ol-photo);
  }

  .tour-art :global(.go-fill) {
    fill: var(--ol-go);
  }

  .tour-art :global(.go-tint) {
    fill: var(--ol-go-tint);
  }

  .tour-art :global(.txt),
  .tour-art :global(.txt-fill) {
    fill: var(--ol-text);
  }

  .tour-art :global(.mut) {
    fill: var(--ol-text-muted);
  }

  .tour-art :global(.mono-text) {
    font-family: var(--ol-font-mono);
  }

  .tour-art :global(text) {
    font-family: var(--ol-font);
  }

  .tour-art :global(text.mono-text) {
    font-family: var(--ol-font-mono);
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (max-width: 760px) {
    :global(.tour) {
      flex-direction: column;
      height: calc(100vh - 32px);
    }

    .art {
      flex: 0 0 auto;
      max-height: 40%;
    }
  }
</style>
