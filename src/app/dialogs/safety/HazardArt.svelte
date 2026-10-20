<script lang="ts" module>
  /** Illustrations for the pre-flight hazard cards. Drawn with tokens so they suit both themes. */
  export type Hazard = 'eyes' | 'fumes' | 'attend' | 'fire' | 'water';
</script>

<script lang="ts">
  let { hazard }: { hazard: Hazard } = $props();
</script>

<svg viewBox="0 0 80 64" width="80" height="64" aria-hidden="true">
  {#if hazard === 'eyes'}
    <!-- Laser glasses stopping a beam. -->
    <line x1="2" y1="14" x2="30" y2="30" class="beam flicker" stroke-width="2.5" stroke-linecap="round" />
    <path
      d="M14 26c0-5 4-8 9-8h34c5 0 9 3 9 8v6c0 7-5 12-12 12h-3c-5 0-8-3-10-7h-2c-2 4-5 7-10 7h-3c-7 0-12-5-12-12z"
      class="frame"
    />
    <path d="M18 27c0-3 2-5 5-5h11c3 0 5 2 5 5v4c0 5-3 8-8 8h-4c-5 0-9-3-9-8z" class="lens" />
    <path d="M41 27c0-3 2-5 5-5h11c3 0 5 2 5 5v4c0 5-4 8-9 8h-4c-5 0-8-3-8-8z" class="lens" />
    <circle cx="30" cy="30" r="3" class="spark" />
  {:else if hazard === 'fumes'}
    <!-- Smoke rising from a burn into an extraction hood. -->
    <path d="M22 6h36l-6 12H28z" class="frame" />
    <rect x="34" y="2" width="12" height="5" rx="1.5" class="frame" />
    <path
      d="M30 50c-6-6 6-10 0-16s6-10 0-14"
      class="smoke s1"
      fill="none"
      stroke-width="2.5"
      stroke-linecap="round"
    />
    <path
      d="M40 50c-6-6 6-10 0-16s6-10 0-14"
      class="smoke s2"
      fill="none"
      stroke-width="2.5"
      stroke-linecap="round"
    />
    <path
      d="M50 50c-6-6 6-10 0-16s6-10 0-14"
      class="smoke s3"
      fill="none"
      stroke-width="2.5"
      stroke-linecap="round"
    />
    <rect x="12" y="52" width="56" height="7" rx="2" class="board" />
    <circle cx="40" cy="52" r="2.5" class="spark" />
  {:else if hazard === 'attend'}
    <!-- An eye on the laser head. -->
    <rect x="8" y="40" width="64" height="18" rx="3" class="board" />
    <line x1="8" y1="40" x2="72" y2="40" class="rail" stroke-width="3" />
    <rect x="34" y="30" width="14" height="12" rx="2" class="frame" />
    <line x1="41" y1="42" x2="41" y2="50" class="beam" stroke-width="2" />
    <circle cx="41" cy="51" r="2" class="spark" />
    <path d="M18 18c6-10 18-10 24 0-6 10-18 10-24 0z" class="eye" />
    <circle cx="30" cy="18" r="4" class="pupil look" />
  {:else if hazard === 'water'}
    <!-- A laser tube with coolant flowing through its jacket. -->
    <rect x="6" y="22" width="60" height="18" rx="9" class="frame" />
    <rect x="12" y="27" width="48" height="8" rx="4" class="coolant" />
    <path d="M14 31h44" class="flow" fill="none" stroke-width="2" stroke-linecap="round" />
    <path d="M66 31h8" class="beam" stroke-width="3" stroke-linecap="round" />
    <path d="M18 22v-8h10M54 40v8H44" class="pipe" fill="none" stroke-width="2.5" stroke-linecap="round" />
    <path d="M30 10c0 3-3 4-3 6a3 3 0 0 0 6 0c0-2-3-3-3-6z" class="drop" />
  {:else}
    <!-- A small flame and an extinguisher ready beside it. -->
    <path
      d="M24 56c-9 0-14-7-12-15 1-5 5-8 6-14 4 4 4 8 4 8s3-4 2-10c7 5 12 12 11 20-1 7-5 11-11 11z"
      class="flame flicker"
    />
    <rect x="48" y="22" width="16" height="36" rx="5" class="tank" />
    <path d="M52 22v-6h8v6" class="frame" />
    <path
      d="M60 16h8l2 8"
      class="hose"
      fill="none"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <rect x="51" y="34" width="10" height="8" rx="1.5" class="label" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }

  .beam {
    stroke: var(--ol-signal);
  }

  .spark,
  .flame {
    fill: var(--ol-signal);
  }

  .frame {
    fill: var(--ol-surface-2);
    stroke: var(--ol-text-muted);
    stroke-width: 2;
  }

  .lens {
    fill: var(--ol-hold);
    fill-opacity: 0.55;
  }

  .board {
    fill: var(--ol-hold-tint);
    stroke: var(--ol-hold);
    stroke-width: 1.5;
  }

  .rail {
    stroke: var(--ol-text-muted);
  }

  .smoke {
    stroke: var(--ol-text-dim);
    animation: rise 2.4s ease-in-out infinite;
  }

  .s2 {
    animation-delay: 0.5s;
  }

  .s3 {
    animation-delay: 1s;
  }

  .eye {
    fill: var(--ol-surface-2);
    stroke: var(--ol-beam);
    stroke-width: 2;
  }

  .pupil {
    fill: var(--ol-beam);
  }

  .look {
    animation: look 3s ease-in-out infinite;
  }

  .tank {
    fill: var(--ol-signal);
    fill-opacity: 0.85;
  }

  .coolant {
    fill: var(--ol-beam);
    fill-opacity: 0.35;
  }

  .flow {
    stroke: var(--ol-beam);
    stroke-dasharray: 4 4;
    animation: flow 1s linear infinite;
  }

  .pipe {
    stroke: var(--ol-text-muted);
  }

  .drop {
    fill: var(--ol-beam);
  }

  .hose {
    stroke: var(--ol-text-muted);
  }

  .label {
    fill: var(--ol-surface);
  }

  .flicker {
    animation: flicker 0.9s ease-in-out infinite alternate;
    transform-origin: 50% 100%;
    transform-box: fill-box;
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -8;
    }
  }

  @keyframes rise {
    0% {
      transform: translateY(4px);
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
    100% {
      transform: translateY(-4px);
      opacity: 0.3;
    }
  }

  @keyframes look {
    0%,
    100% {
      transform: translateX(0);
    }
    50% {
      transform: translateX(4px) translateY(2px);
    }
  }

  @keyframes flicker {
    from {
      transform: scaleY(0.92);
      opacity: 0.85;
    }
    to {
      transform: scaleY(1.05);
      opacity: 1;
    }
  }
</style>
