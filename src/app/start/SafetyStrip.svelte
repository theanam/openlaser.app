<script lang="ts">
  import HazardArt, { type Hazard } from '../dialogs/safety/HazardArt.svelte';

  /** Start-screen safety note: the three habits as pictures, then Stop and Esc. */
  const HABITS: Array<{ id: Hazard; label: string }> = [
    { id: 'eyes', label: 'Eye protection' },
    { id: 'fumes', label: 'Ventilation' },
    { id: 'attend', label: 'Stay with it' },
  ];
</script>

<div class="safety" role="note" data-testid="start-safety">
  <ul class="tiles" aria-hidden="true">
    {#each HABITS as h (h.id)}
      <li><HazardArt hazard={h.id} /><span>{h.label}</span></li>
    {/each}
    <li class="stop">
      <svg viewBox="0 0 80 64" width="80" height="64">
        <!-- A big red stop button with the Esc key beside it. -->
        <path d="M22 10h16l11 11v16L38 48H22L11 37V21z" class="octagon" />
        <rect x="18" y="26" width="24" height="6" rx="1.5" class="bar" />
        <rect x="52" y="34" width="22" height="18" rx="4" class="key" />
        <rect x="52" y="34" width="22" height="15" rx="4" class="key-top" />
        <text x="63" y="45" class="key-label">Esc</text>
      </svg>
      <span>Stop &amp; Esc</span>
    </li>
  </ul>
  <p>
    Wear eye protection rated for your laser, ventilate the room and never leave a running job. Stop is always
    on screen and <span class="kbd">Esc</span> halts a job instantly.
  </p>
</div>

<style>
  .safety {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px 16px;
    border-radius: var(--ol-radius-lg);
    background: var(--ol-signal-tint);
    border: 1px solid var(--ol-signal-soft);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tiles li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px 8px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-bg);
    border: 1px solid var(--ol-border);
    font-size: var(--ol-fs-sm);
    font-weight: 500;
    color: var(--ol-text-2);
    text-align: center;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
  }

  .octagon {
    fill: var(--ol-signal);
    stroke: var(--ol-signal-soft);
    stroke-width: 3;
    stroke-linejoin: round;
  }

  .bar {
    fill: var(--ol-bg);
  }

  .key {
    fill: var(--ol-border-strong);
  }

  .key-top {
    fill: var(--ol-surface-2);
    stroke: var(--ol-border-strong);
    stroke-width: 1;
  }

  .key-label {
    font: 600 8px var(--ol-font-mono);
    fill: var(--ol-text);
    text-anchor: middle;
  }

  .stop .octagon {
    animation: press 2.4s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }

  @keyframes press {
    0%,
    80%,
    100% {
      transform: scale(1);
    }
    88% {
      transform: scale(0.92);
    }
  }

  @media (max-width: 520px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stop .octagon {
      animation: none;
    }
  }
</style>
