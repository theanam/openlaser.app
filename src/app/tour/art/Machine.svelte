<script lang="ts">
  const lines = [
    { t: '→ $H', c: 'beam-fill' },
    { t: '← ok', c: 'go-fill' },
    { t: '→ $J=G91 G21 X10 F3000', c: 'beam-fill' },
    { t: '← ok', c: 'go-fill' },
    { t: '← <Idle|MPos:210.000,50.000,0.000>', c: 'mut' },
    { t: '→ $$', c: 'beam-fill' },
    { t: '← $30=1000', c: 'mut' },
    { t: '← $32=1', c: 'mut' },
    { t: '← ok', c: 'go-fill' },
  ];
  const pad = [
    [1, 0, 'M6 15l6-6 6 6'],
    [0, 1, 'M15 6l-6 6 6 6'],
    [2, 1, 'M9 6l6 6-6 6'],
    [1, 2, 'M6 9l6 6 6-6'],
  ] as const;
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <g transform="translate(24 30)">
    {#each pad as [c, r, d], i (i)}
      <g transform="translate({c * 52} {r * 52})">
        <rect width="46" height="46" rx="10" class="panel key" style="animation-delay: {i * 0.6}s" />
        <path
          {d}
          transform="translate(11 11)"
          fill="none"
          class="txt-stroke"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
    {/each}
    <g transform="translate(52 52)">
      <rect width="46" height="46" rx="10" class="line-fill" />
      <path
        d="M14 24l9-8 9 8M16 22v10h14V22"
        fill="none"
        class="txt-stroke"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </g>
    <text x="0" y="186" class="mono-text txt" font-size="17"><tspan class="mut">X</tspan> 210.000</text>
    <text x="0" y="210" class="mono-text txt" font-size="17"><tspan class="mut">Y</tspan> 50.000</text>
    {#each ['0.1', '1', '10', '50'] as s, i (s)}
      <rect x={i * 38} y="228" width="34" height="24" rx="6" class={s === '10' ? 'step-on' : 'panel'} />
      <text x={i * 38 + 17} y="244" text-anchor="middle" class="mono-text txt" font-size="10">{s}</text>
    {/each}
  </g>
  <g transform="translate(200 24)">
    <rect width="220" height="252" rx="10" class="bed" />
    <clipPath id="tour-console"><rect width="220" height="252" rx="10" /></clipPath>
    <g clip-path="url(#tour-console)">
      <g class="scroll">
        {#each [...lines, ...lines] as l, i (i)}
          <text x="12" y={24 + i * 22} class="mono-text {l.c}" font-size="9.5">{l.t}</text>
        {/each}
      </g>
    </g>
  </g>
</svg>

<style>
  .txt-stroke {
    stroke: var(--ol-text);
  }

  .key {
    animation: press 2.4s step-end infinite;
  }

  .step-on {
    fill: var(--ol-signal-tint);
    stroke: var(--ol-signal);
  }

  .scroll {
    animation: scroll 9s linear infinite;
  }

  @keyframes press {
    0% {
      fill: var(--ol-border-strong);
    }
    25% {
      fill: var(--ol-surface-2);
    }
  }

  @keyframes scroll {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-198px);
    }
  }
</style>
