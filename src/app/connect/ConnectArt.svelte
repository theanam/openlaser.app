<script lang="ts" module>
  /** Illustrations for the connection walkthrough. Drawn with tokens so they suit both themes. */
  export type ConnectStep = 'power' | 'cable' | 'driver' | 'checks';
</script>

<script lang="ts">
  let { step }: { step: ConnectStep } = $props();
</script>

<svg viewBox="0 0 72 56" width="72" height="56" aria-hidden="true">
  {#if step === 'power'}
    <!-- A controller board with its power light on. -->
    <rect x="8" y="14" width="56" height="34" rx="4" class="board" />
    <rect x="16" y="22" width="16" height="12" rx="2" class="chip" />
    <rect x="40" y="38" width="16" height="4" rx="1" class="pins" />
    <circle cx="50" cy="26" r="4" class="led" />
    <circle cx="50" cy="26" r="8" class="glow" />
    <path d="M36 4v8M30 7a9 9 0 1 0 12 0" class="power" />
  {:else if step === 'cable'}
    <!-- A USB plug heading into a laptop's port. -->
    <path d="M6 40h34v6H6z" class="frame" />
    <rect x="10" y="14" width="26" height="24" rx="2" class="frame" />
    <rect x="13" y="17" width="20" height="18" rx="1" class="screen" />
    <rect x="42" y="38" width="5" height="4" rx="0.5" class="port" />
    <path d="M47 40h7" class="plug-metal" />
    <rect x="54" y="36" width="10" height="8" rx="2" class="plug" />
    <path d="M64 40c4 0 6-4 6-10V10" class="cable flow" />
  {:else if step === 'driver'}
    <!-- A chip receiving its driver. -->
    <rect x="20" y="20" width="32" height="28" rx="3" class="chip" />
    {#each [26, 33, 40, 47] as y (y)}
      <path d="M14 {y - 2}h6M52 {y - 2}h6" class="pins-line" />
    {/each}
    <text x="36" y="38" class="label">CH340</text>
    <path d="M36 2v12M30 9l6 6 6-6" class="arrow drop" />
  {:else}
    <!-- A port list with the laser found. -->
    <rect x="8" y="6" width="56" height="44" rx="4" class="frame" />
    <rect x="14" y="14" width="44" height="8" rx="2" class="row" />
    <rect x="14" y="26" width="44" height="8" rx="2" class="row found" />
    <rect x="14" y="38" width="30" height="6" rx="2" class="row" />
    <path d="M18 30l3 3 5-6" class="tick" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }

  .board {
    fill: var(--ol-go-tint);
    stroke: var(--ol-go);
    stroke-width: 1.5;
  }

  .chip {
    fill: var(--ol-surface-2);
    stroke: var(--ol-text-muted);
    stroke-width: 1.5;
  }

  .pins,
  .port {
    fill: var(--ol-text-muted);
  }

  .pins-line {
    stroke: var(--ol-text-muted);
    stroke-width: 2;
  }

  .led {
    fill: var(--ol-go);
  }

  .glow {
    fill: var(--ol-go);
    opacity: 0.25;
    animation: pulse 1.6s ease-in-out infinite alternate;
  }

  .power,
  .arrow {
    fill: none;
    stroke: var(--ol-beam);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .frame {
    fill: var(--ol-surface-2);
    stroke: var(--ol-text-muted);
    stroke-width: 1.5;
  }

  .screen {
    fill: var(--ol-bed);
  }

  .plug {
    fill: var(--ol-beam);
  }

  .plug-metal {
    stroke: var(--ol-text-muted);
    stroke-width: 4;
  }

  .cable {
    fill: none;
    stroke: var(--ol-beam);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-dasharray: 4 3;
  }

  .flow {
    animation: flow 1.2s linear infinite;
  }

  .label {
    font: 600 8px var(--ol-font-mono);
    fill: var(--ol-text);
    text-anchor: middle;
  }

  .drop {
    animation: drop 1.6s ease-in-out infinite;
  }

  .row {
    fill: var(--ol-border);
  }

  .found {
    fill: var(--ol-go-tint);
    stroke: var(--ol-go);
    stroke-width: 1.2;
  }

  .tick {
    fill: none;
    stroke: var(--ol-go);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @keyframes pulse {
    from {
      opacity: 0.1;
    }
    to {
      opacity: 0.4;
    }
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -14;
    }
  }

  @keyframes drop {
    0%,
    100% {
      transform: translateY(-2px);
    }
    50% {
      transform: translateY(2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow,
    .flow,
    .drop {
      animation: none;
    }
  }
</style>
