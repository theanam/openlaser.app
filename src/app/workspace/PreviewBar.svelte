<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { count, distance, duration } from '../lib/format';
  import { preview } from '../state/preview.svelte';
  import { editor } from '../state/editor.svelte';

  const source = $derived(preview.source);
  const moves = $derived(source?.moves ?? null);
  const total = $derived(moves?.count ?? 0);
  const position = $derived(preview.scrub ?? total);
  const lineAt = $derived(moves && position > 0 ? moves.line[Math.min(position, total) - 1] + 1 : 0);
  const lineCount = $derived(source?.lines.length ?? 0);
  const warnings = $derived(source?.warnings ?? []);

  // Plays the whole job in about eight seconds regardless of its size.
  const PLAY_SECONDS = 8;
  let raf = 0;

  function toggle() {
    if (preview.playing) {
      stop();
      return;
    }
    if (!moves || total === 0) return;
    if (position >= total) preview.scrub = 0;
    preview.playing = true;
    let last = performance.now();
    const step = (now: number) => {
      if (!preview.playing) return;
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(
        total,
        (preview.scrub ?? 0) + Math.max(1, Math.round((total / PLAY_SECONDS) * dt)),
      );
      preview.scrub = next;
      if (next >= total) {
        stop();
        preview.scrub = null;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function stop() {
    preview.playing = false;
    cancelAnimationFrame(raf);
  }

  $effect(() => () => cancelAnimationFrame(raf));
</script>

<div class="bar" data-testid="preview-bar">
  <button
    type="button"
    class="icon-btn play"
    aria-label={preview.playing ? 'Pause preview' : 'Play preview'}
    onclick={toggle}
    disabled={total === 0}
  >
    {#if preview.playing}<Pause size={16} />{:else}<Play size={16} />{/if}
  </button>
  <label class="scrub">
    <span class="label">
      {#if preview.compiling}
        <LoaderCircle size={12} class="spin" />Compiling…
      {:else if preview.error && !editor.gcode}
        <span class="err">{preview.error}</span>
      {:else}
        Step through job
      {/if}
    </span>
    <input
      type="range"
      min="0"
      max={total}
      value={position}
      disabled={total === 0}
      aria-label="Step through job"
      oninput={(e) => {
        stop();
        const v = Number(e.currentTarget.value);
        preview.scrub = v >= total ? null : v;
      }}
      data-testid="preview-scrubber"
    />
  </label>
  <div class="stats mono">
    <span data-testid="preview-lines">{count(lineAt)} / {count(lineCount)} lines</span>
    {#if source?.stats}
      <span class="muted"
        >est. {duration(source.stats.estimatedSeconds)} · burn {distance(source.stats.burnDistance)} · travel {distance(
          source.stats.travelDistance,
        )}</span
      >
    {/if}
  </div>
  {#if warnings.length}
    <div class="warnings" role="status">
      {#each warnings as w, i (i)}
        <span class="warn" class:blocking={w.blocking} title={w.message}
          ><TriangleAlert size={12} />{w.message}</span
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-top: 1px solid var(--ol-border);
    background: var(--ol-surface);
    flex-wrap: wrap;
  }

  .play {
    background: var(--ol-surface-2);
  }

  .scrub {
    flex: 1 1 280px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .err {
    color: var(--ol-hold);
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--ol-signal);
  }

  .stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: var(--ol-fs-sm);
    line-height: 1.6;
    color: var(--ol-text-2);
  }

  .warnings {
    flex-basis: 100%;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .warn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: var(--ol-radius-xs);
    background: var(--ol-hold-tint);
    color: var(--ol-hold);
    font-size: var(--ol-fs-sm);
  }

  .warn.blocking {
    background: var(--ol-signal-tint);
    color: var(--ol-signal-text);
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
