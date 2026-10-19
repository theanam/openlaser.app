<script lang="ts">
  import { shapeGlyphPath, type ShapeKind } from '$lib/shapes';
  import Bed from './Bed.svelte';

  const SHAPES: ShapeKind[] = ['star', 'cog', 'heart', 'arrow', 'flower', 'shield', 'cloud', 'bolt', 'donut'];
  const SAMPLES = [
    { text: 'Walnut & Co.', family: 'Georgia, serif', size: 30, weight: 600 },
    { text: 'Hand made', family: "'Brush Script MT', 'Segoe Script', cursive", size: 34, weight: 400 },
    { text: 'LASER 01', family: 'var(--ol-font-mono)', size: 22, weight: 500 },
  ];
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed />
  {#each SAMPLES as s, i (s.text)}
    <text
      x="24"
      y={70 + i * 64}
      class="sample"
      style="font-family: {s.family}; font-size: {s.size}px; font-weight: {s.weight}; animation-delay: {i *
        0.5}s">{s.text}</text
    >
  {/each}
  {#each SHAPES as kind, i (kind)}
    <g
      transform="translate({262 + (i % 3) * 54} {40 + Math.floor(i / 3) * 74}) scale(2)"
      class="glyph"
      style="animation-delay: {i * 0.18}s"
    >
      <path d={shapeGlyphPath(kind)} fill-rule="evenodd" class="shape" />
    </g>
  {/each}
</svg>

<style>
  .sample {
    fill: var(--ol-beam);
    opacity: 0;
    animation: write 0.8s ease-out forwards;
  }

  .shape {
    fill: var(--ol-signal);
    fill-opacity: 0.2;
    stroke: var(--ol-signal);
    stroke-width: 1;
    stroke-linejoin: round;
  }

  .glyph {
    opacity: 0;
    animation: pop 0.5s ease-out forwards;
  }

  @keyframes write {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes pop {
    to {
      opacity: 1;
    }
  }
</style>
