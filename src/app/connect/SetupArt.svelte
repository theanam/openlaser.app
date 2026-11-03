<script lang="ts">
  import type { SetupArt } from './setup-guide';

  /** Small mock-ups of what each setup step looks like on screen. `scheme` labels the address bar. */
  let { art, scheme = 'chrome' }: { art: SetupArt; scheme?: string } = $props();
</script>

<svg viewBox="0 0 96 64" width="120" height="80" aria-hidden="true">
  {#if art === 'copy'}
    <rect x="6" y="20" width="84" height="24" rx="5" class="field" />
    <rect x="12" y="29" width="46" height="6" rx="2" class="text" />
    <rect x="66" y="25" width="18" height="14" rx="3" class="hot" />
    <rect x="71" y="28" width="7" height="8" rx="1" class="glyph" />
    <rect x="73" y="30" width="7" height="8" rx="1" class="glyph" />
  {:else if art === 'paste'}
    <rect x="4" y="6" width="88" height="40" rx="4" class="window" />
    <rect x="10" y="12" width="76" height="12" rx="6" class="hot-field" />
    <text x="16" y="21" class="mono">{scheme}://flags</text>
    <path d="M70 15v6" class="cursor" />
    <rect x="62" y="48" width="30" height="13" rx="3" class="key" />
    <text x="77" y="57.5" class="key-text">Enter</text>
  {:else if art === 'flag'}
    <rect x="4" y="6" width="88" height="52" rx="4" class="window" />
    <rect x="8" y="18" width="80" height="20" rx="3" class="highlight" />
    <rect x="12" y="23" width="36" height="4" rx="2" class="text" />
    <rect x="12" y="30" width="26" height="3" rx="1.5" class="faint" />
    <rect x="50" y="22" width="36" height="12" rx="3" class="hot" />
    <text x="64" y="30.5" class="on-hot">Enabled</text>
    <path d="M79.5 26.5l2 2 2-2" class="on-hot-line" />
    <rect x="12" y="44" width="40" height="4" rx="2" class="faint" />
  {:else if art === 'relaunch'}
    <rect x="4" y="6" width="88" height="52" rx="4" class="window" />
    <rect x="10" y="14" width="50" height="4" rx="2" class="faint" />
    <rect x="10" y="22" width="36" height="4" rx="2" class="faint" />
    <rect x="44" y="36" width="40" height="14" rx="4" class="hot" />
    <text x="64" y="45.5" class="on-hot">Relaunch</text>
    <path d="M80 46l0 11 3-3 3 5 2-1-3-5 4-1z" class="pointer" />
  {:else if art === 'toggle'}
    <circle cx="28" cy="32" r="18" class="soft" />
    <path d="M22 25l12 12-6 5V22l6 5-12 12" class="rune" />
    <rect x="54" y="22" width="34" height="20" rx="10" class="go" />
    <circle cx="78" cy="32" r="7" class="knob" />
  {:else if art === 'permission'}
    <rect x="4" y="8" width="88" height="48" rx="4" class="window" />
    <rect x="10" y="16" width="10" height="10" rx="3" class="faint" />
    <rect x="24" y="19" width="30" height="4" rx="2" class="faint" />
    <rect x="70" y="16" width="16" height="10" rx="5" class="off" />
    <circle cx="75" cy="21" r="3.5" class="knob" />
    <rect x="8" y="33" width="80" height="16" rx="3" class="highlight" />
    <circle cx="15" cy="41" r="5" class="hot" />
    <rect x="24" y="39" width="26" height="4" rx="2" class="text" />
    <rect x="70" y="36" width="16" height="10" rx="5" class="go" />
    <circle cx="81" cy="41" r="3.5" class="knob" />
  {:else if art === 'terminal'}
    <rect x="6" y="8" width="84" height="48" rx="4" class="term" />
    <path d="M14 22l6 5-6 5" class="prompt" />
    <rect x="24" y="30" width="34" height="3" rx="1.5" class="prompt-fill" />
    <rect x="62" y="28" width="5" height="7" class="caret" />
  {:else if art === 'retry'}
    <rect x="14" y="20" width="68" height="24" rx="6" class="signal" />
    <text x="57" y="35.5" class="on-signal">Connect</text>
    <path d="M28 27a6 6 0 1 0 5 3M33 25v5h-5" class="on-signal-line" />
  {:else if art === 'browser'}
    <rect x="4" y="6" width="88" height="52" rx="4" class="window" />
    <rect x="4" y="6" width="88" height="12" rx="4" class="bar" />
    <circle cx="11" cy="12" r="2" class="faint" />
    <circle cx="18" cy="12" r="2" class="faint" />
    <circle cx="48" cy="38" r="12" class="globe" />
    <path d="M36 38h24M48 26c-6 7-6 17 0 24M48 26c6 7 6 17 0 24" class="globe-line" />
  {:else}
    <rect x="18" y="8" width="60" height="38" rx="3" class="window" />
    <rect x="23" y="13" width="50" height="28" rx="1" class="screen" />
    <path d="M8 50h80l-6 6H14z" class="base" />
    <path d="M38 27l6 5 12-10" class="tick" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex-shrink: 0;
  }

  .window,
  .field {
    fill: var(--ol-surface-2);
    stroke: var(--ol-border-strong);
    stroke-width: 1.2;
  }

  .bar {
    fill: var(--ol-border);
  }

  .text {
    fill: var(--ol-text-muted);
  }

  .faint {
    fill: var(--ol-border-strong);
  }

  .hot,
  .signal {
    fill: var(--ol-signal);
  }

  .hot-field {
    fill: var(--ol-surface);
    stroke: var(--ol-signal);
    stroke-width: 1.5;
  }

  .highlight {
    fill: var(--ol-signal-tint);
    stroke: var(--ol-signal);
    stroke-width: 1;
    stroke-dasharray: 3 2;
  }

  .glyph {
    fill: var(--ol-signal);
    stroke: var(--ol-on-signal);
    stroke-width: 1.2;
  }

  .mono {
    font: 600 7px var(--ol-font-mono);
    fill: var(--ol-text);
  }

  .cursor {
    stroke: var(--ol-signal);
    stroke-width: 1.5;
    animation: blink 1s steps(1) infinite;
  }

  .key {
    fill: var(--ol-surface);
    stroke: var(--ol-border-strong);
    stroke-width: 1.2;
  }

  .key-text,
  .on-hot,
  .on-signal {
    font: 600 7px var(--ol-font);
    text-anchor: middle;
  }

  .key-text {
    fill: var(--ol-text);
  }

  .on-hot,
  .on-signal {
    fill: var(--ol-on-signal);
  }

  .on-signal {
    font-size: 9px;
  }

  .on-hot-line,
  .on-signal-line {
    fill: none;
    stroke: var(--ol-on-signal);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pointer {
    fill: var(--ol-text);
    stroke: var(--ol-surface);
    stroke-width: 1;
  }

  .soft {
    fill: var(--ol-signal-tint);
  }

  .rune {
    fill: none;
    stroke: var(--ol-signal);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .go {
    fill: var(--ol-go);
  }

  .off {
    fill: var(--ol-border-strong);
  }

  .knob {
    fill: var(--ol-surface);
  }

  .term {
    fill: var(--ol-text);
  }

  .prompt {
    fill: none;
    stroke: var(--ol-go);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .prompt-fill {
    fill: var(--ol-bg);
  }

  .caret {
    fill: var(--ol-go);
    animation: blink 1s steps(1) infinite;
  }

  .globe {
    fill: var(--ol-signal-tint);
    stroke: var(--ol-signal);
    stroke-width: 1.5;
  }

  .globe-line {
    fill: none;
    stroke: var(--ol-signal);
    stroke-width: 1.2;
  }

  .screen {
    fill: var(--ol-bed);
  }

  .base {
    fill: var(--ol-border-strong);
  }

  .tick {
    fill: none;
    stroke: var(--ol-go);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor,
    .caret {
      animation: none;
    }
  }
</style>
