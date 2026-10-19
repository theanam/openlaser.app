<script lang="ts">
  import Bed from './Bed.svelte';

  let { preset }: { preset?: { bedWidth: number; bedHeight: number } } = $props();

  const MAX = 470;
  const w = $derived(((preset?.bedWidth ?? 400) / MAX) * 300);
  const h = $derived(((preset?.bedHeight ?? 400) / MAX) * 240);
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <g class="grow" style="transform: translate({220 - w / 2}px, {150 - h / 2}px)">
    <Bed {w} {h} />
    <rect width={w} height={h} rx="6" fill="none" class="frame-stroke" />
    <circle cx="0" cy={h} r="5" class="sig-fill" />
    <text x="8" y={h - 8} class="mono-text sig-fill" font-size="10">0,0</text>
  </g>
  <text x="220" y="292" text-anchor="middle" class="mono-text txt" font-size="12"
    >{preset?.bedWidth ?? 400} × {preset?.bedHeight ?? 400} mm</text
  >
</svg>

<style>
  .grow {
    transition: transform 0.3s ease;
  }

  .grow :global(rect) {
    transition:
      width 0.3s ease,
      height 0.3s ease;
  }
</style>
