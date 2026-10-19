<script lang="ts">
  import { APP_NAME } from '../config/app';

  interface Props {
    size?: number;
    /** 'tile' = mark on a graphite tile, 'bare' = no tile. */
    variant?: 'tile' | 'bare';
    wordmark?: boolean;
    domain?: boolean;
    fontSize?: number;
  }

  let { size = 28, variant = 'tile', wordmark = true, domain = false, fontSize = 16 }: Props = $props();
</script>

<span class="lockup">
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label={APP_NAME}>
    {#if variant === 'tile'}
      <rect x="1" y="1" width="46" height="46" rx="12" class="tile" stroke-width="2" />
    {/if}
    <circle cx="24" cy="27" r="11" class="ring" stroke-width="3.6" />
    <line x1="24" y1="7" x2="24" y2="22" class="beam" stroke-width="3.6" stroke-linecap="round" />
    <circle cx="24" cy="27" r="3.6" class="dot" />
  </svg>
  {#if wordmark}
    <span class="word" style="font-size: {fontSize}px"
      >{APP_NAME}{#if domain}<span class="tld">.app</span>{/if}</span
    >
  {/if}
</span>

<style>
  .lockup {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .tile {
    fill: var(--ol-bg);
    stroke: var(--ol-border);
  }

  .ring {
    stroke: var(--ol-text);
  }

  .beam {
    stroke: var(--ol-signal);
  }

  .dot {
    fill: var(--ol-signal);
  }

  .word {
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .tld {
    color: var(--ol-text-dim);
  }
</style>
