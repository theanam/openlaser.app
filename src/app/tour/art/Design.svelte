<script lang="ts">
  import Bed from './Bed.svelte';
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <Bed />
  <g class="mono-text" font-size="10">
    <rect x="14" y="12" width="412" height="26" rx="6" class="panel" />
    <g transform="translate(24 20)">
      {#each [0, 1, 2] as r (r)}{#each [0, 1, 2] as c (c)}<rect
            x={c * 4}
            y={r * 4}
            width="3"
            height="3"
            rx="0.5"
            class={r === 2 && c === 0 ? 'sig-fill' : 'off-fill'}
          />{/each}{/each}
    </g>
    <text x="48" y="29" class="mut">X</text><text x="58" y="29" class="txt">120.000</text>
    <text x="118" y="29" class="mut">Y</text><text x="128" y="29" class="txt">80.000</text>
    <text x="188" y="29" class="mut">W</text><text x="198" y="29" class="txt scrub">140.000</text>
    <text x="258" y="29" class="mut">H</text><text x="268" y="29" class="txt">90.000</text>
    <text x="328" y="29" class="mut">∠</text><text x="338" y="29" class="txt">0°</text>
  </g>
  <g class="obj">
    <rect x="150" y="110" width="140" height="90" rx="14" fill="none" class="sig" stroke-width="2" />
    <ellipse cx="220" cy="155" rx="34" ry="24" class="beam-fill" fill-opacity="0.28" />
    <ellipse cx="220" cy="155" rx="34" ry="24" fill="none" class="beam" stroke-width="1.5" />
    <rect x="144" y="104" width="152" height="102" fill="none" class="beam" stroke-dasharray="4 3" />
    {#each [[144, 104], [220, 104], [296, 104], [144, 155], [296, 155], [144, 206], [220, 206], [296, 206]] as [x, y] (`${x}-${y}`)}
      <rect x={x - 4} y={y - 4} width="8" height="8" class="handle" />
    {/each}
    <line x1="220" y1="104" x2="220" y2="86" class="beam" />
    <circle cx="220" cy="82" r="5" class="handle" />
  </g>
  <g class="ruler">
    <line x1="70" y1="250" x2="370" y2="250" class="beam" stroke-width="1.5" />
    <circle cx="70" cy="250" r="3" class="beam-fill" /><circle cx="370" cy="250" r="3" class="beam-fill" />
    <rect x="178" y="232" width="84" height="18" rx="4" class="panel" />
    <text x="220" y="245" text-anchor="middle" class="mono-text beam-fill" font-size="10">300.00 mm</text>
  </g>
</svg>

<style>
  .obj {
    transform-origin: 144px 206px;
    animation: grow 3.6s ease-in-out infinite alternate;
  }

  .handle {
    fill: var(--ol-bg);
    stroke: var(--ol-beam);
  }

  .scrub {
    animation: blink 3.6s ease-in-out infinite alternate;
  }

  @keyframes grow {
    from {
      transform: scale(0.82);
    }
    to {
      transform: scale(1.08);
    }
  }

  @keyframes blink {
    from {
      fill: var(--ol-text);
    }
    to {
      fill: var(--ol-beam);
    }
  }
</style>
