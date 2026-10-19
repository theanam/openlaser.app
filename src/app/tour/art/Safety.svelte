<script lang="ts">
  const items = [
    'Eye protection on',
    'Room ventilated',
    'Someone stays with the laser',
    'Fire extinguisher nearby',
  ];
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <g transform="translate(36 40)">
    <path d="M70 0l62 22v52c0 46-28 78-62 94C36 152 8 120 8 74V22z" class="go-tint" />
    <path
      d="M70 0l62 22v52c0 46-28 78-62 94C36 152 8 120 8 74V22z"
      fill="none"
      class="go-stroke"
      stroke-width="3"
    />
    <path
      d="M42 84l20 20 38-42"
      fill="none"
      class="go-stroke check"
      stroke-width="7"
      stroke-linecap="round"
      stroke-linejoin="round"
      pathLength="1"
    />
  </g>
  <g transform="translate(200 44)">
    {#each items as item, i (item)}
      <g transform="translate(0 {i * 44})">
        <rect width="216" height="34" rx="8" class="panel" />
        <rect x="10" y="9" width="16" height="16" rx="4" fill="none" class="frame-stroke" />
        <path
          d="M13 17l4 4 7-8"
          fill="none"
          class="go-stroke tick"
          stroke-width="2.4"
          stroke-linecap="round"
          pathLength="1"
          style="animation-delay: {0.5 + i * 0.5}s"
        />
        <text x="36" y="22" class="txt" font-size="12">{item}</text>
      </g>
    {/each}
  </g>
  <g transform="translate(36 236)">
    <rect width="380" height="40" rx="10" class="sig-fill" />
    <text x="190" y="25" text-anchor="middle" class="on-sig" font-size="14" font-weight="600">Stop · Esc</text
    >
  </g>
</svg>

<style>
  .go-stroke {
    stroke: var(--ol-go);
  }

  .check,
  .tick {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: tick 0.5s ease-out forwards;
  }

  .check {
    animation-delay: 0.2s;
  }

  .on-sig {
    fill: var(--ol-on-signal);
  }

  @keyframes tick {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
