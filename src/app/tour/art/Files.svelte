<script lang="ts">
  // Static illustration.
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <g class="float" style="animation-delay: 0s">
    <path d="M30 40h80l24 24v100H30z" class="panel" />
    <path d="M110 40v24h24" fill="none" class="frame-stroke" />
    <rect x="44" y="76" width="34" height="26" rx="3" fill="none" class="sig" stroke-width="2" />
    <rect x="84" y="80" width="36" height="40" class="photo-fill" opacity="0.6" />
    <circle cx="62" cy="128" r="14" fill="none" class="beam" stroke-width="2" />
    <text x="82" y="190" text-anchor="middle" class="mono-text txt" font-size="12">coasters.olaser</text>
  </g>
  <g class="float" style="animation-delay: 0.7s">
    <path d="M176 40h80l24 24v100H176z" class="panel" />
    <path d="M256 40v24h24" fill="none" class="frame-stroke" />
    <text x="190" y="84" class="mono-text mut" font-size="9">&#123;</text>
    <text x="198" y="98" class="mono-text beam-fill" font-size="9">"bedWidth": 400,</text>
    <text x="198" y="112" class="mono-text beam-fill" font-size="9">"maxS": 1000,</text>
    <text x="198" y="126" class="mono-text beam-fill" font-size="9">"origin": "bl"</text>
    <text x="190" y="140" class="mono-text mut" font-size="9">&#125;</text>
    <text x="228" y="190" text-anchor="middle" class="mono-text txt" font-size="12">ortur-lm3.json</text>
  </g>
  <g class="float" style="animation-delay: 1.4s">
    <rect x="316" y="70" width="104" height="58" rx="8" class="panel" />
    <rect x="330" y="40" width="76" height="32" class="paper" />
    <rect x="330" y="118" width="76" height="62" class="paper" />
    <rect x="346" y="128" width="30" height="22" rx="4" fill="none" class="sig" stroke-width="1.5" />
    <path d="M340 168h40M340 165v6M380 165v6" class="ink" stroke-width="1" />
    <text x="368" y="210" text-anchor="middle" class="mono-text txt" font-size="12">1:1 print</text>
  </g>
  <g transform="translate(110 236)">
    {#each [['⌘', 'S'], ['⌘', 'O'], ['⌘', 'Z'], ['⌘', 'P']] as [m, k], i (k)}
      <g transform="translate({i * 58} 0)">
        <rect width="50" height="34" rx="8" class="panel" />
        <text x="25" y="22" text-anchor="middle" class="mono-text txt" font-size="13">{m}{k}</text>
      </g>
    {/each}
  </g>
</svg>

<style>
  .float {
    animation: bob 3s ease-in-out infinite alternate;
  }

  .paper {
    fill: white;
    stroke: var(--ol-border);
  }

  .ink {
    stroke: black;
  }

  @keyframes bob {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-8px);
    }
  }
</style>
