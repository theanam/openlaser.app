<script lang="ts">
  import Bed from './Bed.svelte';
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed x={0} y={0} w={440} h={200} />
  <rect
    x="120"
    y="40"
    width="200"
    height="120"
    fill="none"
    class="beam"
    stroke-width="1.5"
    stroke-dasharray="6 4"
  />
  <g class="head">
    <circle r="9" fill="none" class="sig" stroke-width="1.5" />
    <path d="M0 -18V-11M0 11V18M-18 0H-11M11 0H18" class="sig" stroke-width="1.5" />
    <circle r="2" class="sig-fill" />
  </g>
  <g transform="translate(20 214)">
    <rect width="150" height="34" rx="9" class="panel" />
    <text x="75" y="22" text-anchor="middle" class="txt" font-size="13" font-weight="500">Frame</text>
    <rect x="160" width="240" height="34" rx="9" class="start" />
    <path d="M250 11l11 6-11 6z" class="start-text" />
    <text x="290" y="22" text-anchor="middle" class="start-text" font-size="13" font-weight="600"
      >Start job</text
    >
    <rect y="42" width="400" height="36" rx="9" class="sig-fill stop" />
    <rect x="160" y="54" width="12" height="12" rx="2" class="on-sig" />
    <text x="200" y="65" text-anchor="middle" class="on-sig" font-size="13" font-weight="600">Stop</text>
    <rect x="222" y="51" width="30" height="18" rx="4" class="esc" />
    <text x="237" y="64" text-anchor="middle" class="mono-text on-sig" font-size="10">Esc</text>
  </g>
</svg>

<style>
  .head {
    offset-path: path('M120 40 H320 V160 H120 Z');
    animation: trace 4s linear infinite;
  }

  .start {
    fill: var(--ol-start-bg);
  }

  .start-text {
    fill: var(--ol-start-text);
  }

  .on-sig {
    fill: var(--ol-on-signal);
  }

  .esc {
    fill: var(--ol-signal-deep);
  }

  .stop {
    animation: glow 2s ease-in-out infinite alternate;
  }

  @keyframes trace {
    from {
      offset-distance: 0%;
    }
    to {
      offset-distance: 100%;
    }
  }

  @keyframes glow {
    from {
      opacity: 0.85;
    }
    to {
      opacity: 1;
    }
  }
</style>
