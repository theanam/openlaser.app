<script lang="ts">
  import Bed from './Bed.svelte';

  const rows = [
    { name: 'Engrave', meta: 'Fill · 3000 · 40% · ×1', cls: 'beam' },
    { name: 'Photo', meta: 'Image · 2400 · 55% · ×1', cls: 'photo' },
    { name: 'Cut', meta: 'Line · 400 · 100% · ×3', cls: 'sig' },
  ];
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed x={232} y={20} w={196} h={260} />
  {#each rows as r, i (r.name)}
    <g transform="translate(12 {48 + i * 64})">
      <rect width="206" height="52" rx="10" class="panel row" style="animation-delay: {i * 1}s" />
      <rect x="14" y="20" width="12" height="12" rx="3" class="{r.cls}-fill" />
      <text x="38" y="23" class="txt" font-size="13" font-weight="500">{r.name}</text>
      <text x="38" y="40" class="mono-text mut" font-size="9.5">{r.meta}</text>
      <path d="M186 18l-6 9h5l-1 8 7-10h-5z" class="sig-fill" />
    </g>
  {/each}
  <text x="12" y="30" class="mut" font-size="11">Order = run order</text>

  <g class="hl" style="animation-delay: 0s">
    <polygon points="330,52 368,74 368,118 330,140 292,118 292,74" class="beam-fill" fill-opacity="0.28" />
    <polygon
      points="330,52 368,74 368,118 330,140 292,118 292,74"
      fill="none"
      class="beam"
      stroke-width="1.5"
    />
    <line x1="292" y1="80" x2="368" y2="80" class="beam" stroke-width="1" opacity="0.6" />
    <line x1="292" y1="96" x2="368" y2="96" class="beam" stroke-width="1" opacity="0.6" />
    <line x1="292" y1="112" x2="368" y2="112" class="beam" stroke-width="1" opacity="0.6" />
  </g>
  <rect x="262" y="164" width="70" height="90" rx="2" class="dots hl" style="animation-delay: 1s" />
  <circle cx="380" cy="210" r="34" fill="none" class="sig hl" stroke-width="2" style="animation-delay: 2s" />
  <defs>
    <pattern id="tour-dots-2" width="5" height="5" patternUnits="userSpaceOnUse"
      ><circle cx="2.5" cy="2.5" r="1.3" class="photo-fill" /></pattern
    >
  </defs>
</svg>

<style>
  .dots {
    fill: url(#tour-dots-2);
  }

  .row {
    animation: focus 3s step-end infinite;
  }

  .hl {
    animation: dim 3s step-end infinite;
  }

  @keyframes focus {
    0% {
      stroke: var(--ol-border-strong);
      fill: var(--ol-surface-2);
    }
    33% {
      stroke: var(--ol-border);
      fill: var(--ol-surface);
    }
  }

  @keyframes dim {
    0% {
      opacity: 1;
    }
    33% {
      opacity: 0.45;
    }
  }
</style>
