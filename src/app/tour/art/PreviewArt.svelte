<script lang="ts">
  import Bed from './Bed.svelte';

  // Zig-zag fill inside a rounded square, plus a circle cut, plus travel moves between them.
  const fill: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = 80 + i * 8;
    const inset = Math.max(0, 14 - Math.min(i, 11 - i) * 6);
    fill.push(i % 2 === 0 ? `M${70 + inset} ${y}H${170 - inset}` : `M${170 - inset} ${y}H${70 + inset}`);
  }
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed />
  <path
    d="M20 280 L70 80 M170 168 L300 74 M300 186 L20 280"
    fill="none"
    class="beam travel"
    stroke-width="1.2"
    stroke-dasharray="4 4"
  />
  <path d={fill.join(' ')} fill="none" class="sig draw" stroke-width="3" pathLength="1" />
  <rect
    x="60"
    y="68"
    width="120"
    height="112"
    rx="14"
    fill="none"
    class="soft draw d2"
    stroke-width="2.5"
    pathLength="1"
  />
  <circle cx="300" cy="130" r="56" fill="none" class="soft draw d3" stroke-width="2.5" pathLength="1" />
  <g transform="translate(20 236)">
    <rect width="400" height="40" rx="8" class="panel" />
    <circle cx="20" cy="20" r="10" class="line-fill" />
    <path d="M17 14l9 6-9 6z" class="txt-fill" />
    <rect x="40" y="18" width="220" height="4" rx="2" class="line-fill" />
    <rect x="40" y="18" width="220" height="4" rx="2" class="sig-fill bar" />
    <text x="388" y="17" text-anchor="end" class="mono-text txt" font-size="9">18,240 / 42,615 lines</text>
    <text x="388" y="30" text-anchor="end" class="mono-text mut" font-size="9">est. 11 min 40 s</text>
  </g>
</svg>

<style>
  .soft {
    stroke: var(--ol-signal-soft);
  }

  .travel {
    opacity: 0.55;
  }

  .draw {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: trace 4.5s linear infinite;
  }

  .d2 {
    animation-delay: 0.6s;
  }

  .d3 {
    animation-delay: 1.2s;
  }

  .bar {
    transform-origin: 40px 20px;
    animation: fill 4.5s linear infinite;
  }

  @keyframes trace {
    0% {
      stroke-dashoffset: 1;
    }
    60%,
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
</style>
