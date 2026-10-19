<script lang="ts">
  import Bed from './Bed.svelte';
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed />
  <g transform="translate(220 160)">
    <circle r="62" class="ring" stroke-width="12" fill="none" />
    <line x1="0" y1="-150" x2="0" y2="-26" class="sig beam-drop" stroke-width="12" stroke-linecap="round" />
    <circle r="16" class="sig-fill pulse" />
    <circle r="16" class="sig-fill glow" />
  </g>
  <g class="mono-text" font-size="11">
    <text x="24" y="282" class="mut">chrome · edge · opera · brave</text>
    <text x="416" y="282" text-anchor="end" class="go-fill">offline ready</text>
  </g>
</svg>

<style>
  .beam-drop {
    stroke-dasharray: 130;
    stroke-dashoffset: 130;
    animation: drop 1.4s ease-out 0.2s forwards;
  }

  .pulse {
    transform-origin: center;
    transform-box: fill-box;
    animation: pop 0.4s ease-out 1.4s both;
  }

  .glow {
    opacity: 0;
    transform-origin: center;
    transform-box: fill-box;
    animation: ripple 2.4s ease-out 1.6s infinite;
  }

  @keyframes drop {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes pop {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }

  @keyframes ripple {
    0% {
      opacity: 0.5;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(4);
    }
  }
</style>
