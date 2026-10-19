<script lang="ts">
  import Bed from './Bed.svelte';

  // A soft portrait-like blob, dithered with a fixed hash so the picture is stable.
  const STEP = 4;
  const dots: Array<[number, number]> = [];
  for (let y = 0; y < 220; y += STEP) {
    for (let x = 0; x < 300; x += STEP) {
      const dx = (x - 150) / 95;
      const dy = (y - 95) / 75;
      const head = Math.max(0, 1 - Math.hypot(dx, dy));
      const body = Math.max(0, 1 - Math.hypot((x - 150) / 140, (y - 260) / 110));
      const shade = Math.min(1, 0.12 + head * 0.9 + body * 0.8);
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if ((hash % 1000) / 1000 < shade) dots.push([x, y]);
    }
  }
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed />
  <defs>
    <radialGradient id="tour-face" cx="0.5" cy="0.43" r="0.55">
      <stop offset="0" class="stop-shadow" />
      <stop offset="0.7" class="stop-mid" />
      <stop offset="1" class="stop-paper" />
    </radialGradient>
    <clipPath id="tour-split"><rect class="split" x="0" y="0" width="150" height="220" /></clipPath>
  </defs>
  <g transform="translate(70 40)">
    <rect width="300" height="220" fill="url(#tour-face)" rx="2" />
  </g>
  <g transform="translate(70 40)" clip-path="url(#tour-split)" class="dotted">
    <rect width="300" height="220" class="bed" />
    {#each dots as [x, y] (x * 1000 + y)}
      <circle cx={x + 2} cy={y + 2} r="1.45" class="photo-fill" />
    {/each}
  </g>
  <line class="divider" x1="220" y1="34" x2="220" y2="266" stroke-width="2" />
  <text x="70" y="284" class="mono-text photo-fill" font-size="10">portrait.jpg · Atkinson · 254 dpi</text>
</svg>

<style>
  .split {
    animation: wipe 5s ease-in-out infinite alternate;
  }

  .divider {
    stroke: var(--ol-beam);
    animation: move 5s ease-in-out infinite alternate;
  }

  .stop-shadow {
    stop-color: var(--ol-surface-2);
  }

  .stop-mid {
    stop-color: var(--ol-text-dim);
  }

  .stop-paper {
    stop-color: var(--ol-text-2);
  }

  @keyframes wipe {
    from {
      width: 40px;
    }
    to {
      width: 260px;
    }
  }

  @keyframes move {
    from {
      transform: translateX(-110px);
    }
    to {
      transform: translateX(110px);
    }
  }
</style>
