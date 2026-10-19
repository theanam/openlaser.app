<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { toasts } from './toasts.svelte';
</script>

<div class="toaster" role="region" aria-label="Notifications" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast {t.tone}" role={t.tone === 'error' ? 'alert' : 'status'}>
      <span class="dot" aria-hidden="true"></span>
      <span class="msg">{t.message}</span>
      {#if t.action}
        <button
          type="button"
          class="btn small"
          onclick={() => {
            t.action?.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button
        type="button"
        class="icon-btn sm close"
        aria-label="Dismiss"
        onclick={() => toasts.dismiss(t.id)}
      >
        {#if t.duration > 0}
          <!-- Drains as the toast's time runs out. -->
          <svg class="timer" viewBox="0 0 28 28" aria-hidden="true" data-testid="toast-timer">
            <circle cx="14" cy="14" r="12" class="track" />
            <circle
              cx="14"
              cy="14"
              r="12"
              class="left"
              pathLength="100"
              style="animation-duration: {t.duration}ms"
            />
          </svg>
        {/if}
        <X size={14} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    z-index: 60;
    left: 50%;
    top: 68px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    max-width: min(560px, calc(100vw - 32px));
    padding: 4px 4px 4px 14px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-surface);
    border: 1px solid var(--ol-border-strong);
    box-shadow: var(--ol-shadow-pop);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--ol-beam);
  }

  .success .dot {
    background: var(--ol-go);
  }

  .warning .dot {
    background: var(--ol-hold);
  }

  .error .dot {
    background: var(--ol-signal);
  }

  .msg {
    flex: 1;
  }

  .close {
    position: relative;
  }

  .timer {
    position: absolute;
    inset: 50% auto auto 50%;
    width: 26px;
    height: 26px;
    transform: translate(-50%, -50%) rotate(-90deg);
    pointer-events: none;
  }

  .timer circle {
    fill: none;
    stroke-width: 2;
  }

  .track {
    stroke: var(--ol-border);
  }

  .left {
    stroke: var(--ol-beam);
    stroke-dasharray: 100;
    stroke-linecap: round;
    animation: drain linear forwards;
  }

  .success .left {
    stroke: var(--ol-go);
  }

  .warning .left {
    stroke: var(--ol-hold);
  }

  .error .left {
    stroke: var(--ol-signal);
  }

  @keyframes drain {
    to {
      stroke-dashoffset: 100;
    }
  }
</style>
