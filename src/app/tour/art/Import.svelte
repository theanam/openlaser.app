<script lang="ts">
  import Bed from './Bed.svelte';
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed x={150} y={30} w={270} h={250} />
  {#each [{ label: 'SVG', y: 40, cls: 'sig' }, { label: 'PNG', y: 120, cls: 'photo' }, { label: 'NC', y: 200, cls: 'beam' }] as f, i (f.label)}
    <g class="card" style="animation-delay: {i * 0.5}s">
      <path d="M20 {f.y}h56l16 16v56H20z" class="panel" />
      <path d="M76 {f.y}v16h16" fill="none" class="frame-stroke" />
      <text
        x="56"
        y={f.y + 52}
        text-anchor="middle"
        class="mono-text {f.cls}-fill"
        font-size="15"
        font-weight="600">{f.label}</text
      >
    </g>
  {/each}
  <g class="land" style="animation-delay: 0.3s">
    <rect x="186" y="62" width="90" height="70" rx="10" fill="none" class="sig" stroke-width="2" />
    <polygon points="231,75 254,97 231,119 208,97" class="beam-fill" fill-opacity="0.28" />
    <polygon points="231,75 254,97 231,119 208,97" fill="none" class="beam" stroke-width="1.5" />
  </g>
  <g class="land" style="animation-delay: 0.8s">
    <rect x="300" y="70" width="96" height="120" rx="2" class="dither" />
  </g>
  <g class="land" style="animation-delay: 1.3s">
    <path
      d="M186 240 L210 160 L236 210 L262 150 L290 240"
      fill="none"
      class="beam"
      stroke-width="1.5"
      stroke-dasharray="4 3"
    />
    <path d="M186 240 L290 240" class="sig" stroke-width="2" />
  </g>
  <defs>
    <pattern id="tour-dots" width="6" height="6" patternUnits="userSpaceOnUse"
      ><circle cx="3" cy="3" r="1.6" class="photo-fill" /></pattern
    >
  </defs>
</svg>

<style>
  .card {
    animation: nudge 2.6s ease-in-out infinite;
  }

  .land {
    opacity: 0;
    animation: appear 0.6s ease-out forwards;
  }

  .dither {
    fill: url(#tour-dots);
    stroke: var(--ol-photo);
    stroke-dasharray: 4 3;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(10px);
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
