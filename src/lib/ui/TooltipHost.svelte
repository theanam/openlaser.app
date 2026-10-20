<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { placeTooltip, tooltipTarget, tooltipText } from './tooltip';

  const DELAY_MS = 350;
  /** Moving between controls shows the next tooltip at once. */
  const WARM_MS = 600;

  let text = $state<string | null>(null);
  let pos = $state({ x: -9999, y: -9999 });
  let tipEl = $state<HTMLDivElement | null>(null);
  let current: HTMLElement | null = null;
  /** Hovered or focused, waiting out the delay. */
  let pending: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastHidden = 0;

  async function show(el: HTMLElement) {
    pending = null;
    const label = el.isConnected ? tooltipText(el) : null;
    if (!label) return;
    current = el;
    text = label;
    await tick();
    if (!tipEl || current !== el) return;
    const r = el.getBoundingClientRect();
    const t = tipEl.getBoundingClientRect();
    const p = placeTooltip(r, t, { width: window.innerWidth, height: window.innerHeight });
    pos = { x: p.x, y: p.y };
  }

  function schedule(el: HTMLElement) {
    if (el === current || el === pending) return;
    hide();
    pending = el;
    tooltipText(el); // Takes over `title` right away so the native tooltip never appears.
    const warm = performance.now() - lastHidden < WARM_MS;
    timer = setTimeout(() => void show(el), warm ? 0 : DELAY_MS);
  }

  function hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    if (!current && text === null) return;
    if (current) lastHidden = performance.now();
    current = null;
    text = null;
    pos = { x: -9999, y: -9999 };
  }

  onMount(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = tooltipTarget(e.target as Element);
      // Off any tooltip target: also cancels one still waiting out its delay.
      if (el) schedule(el);
      else hide();
    };
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Element | null;
      const active = current ?? pending;
      if (active && (!to || !active.contains(to))) hide();
    };
    const focus = (e: FocusEvent) => {
      const el = tooltipTarget(e.target as Element);
      if (el && (e.target as HTMLElement).matches(':focus-visible')) schedule(el);
    };
    // Deferred: focusout also fires while Svelte removes a focused element mid-update, when state
    // must not change.
    const dismiss = () => queueMicrotask(hide);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    // Safety net for a missed pointerout (a control re-rendered or removed under the pointer):
    // a hover tooltip lasts only while its control is still under the pointer.
    const move = (e: PointerEvent) => {
      const active = current ?? pending;
      if (!active || e.pointerType === 'touch') return;
      const under = e.target instanceof Node && active.contains(e.target);
      if (!active.isConnected || (!under && !active.matches(':focus-visible'))) hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', dismiss);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', dismiss);
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', dismiss, true);
    };
  });
</script>

{#if text}
  <div
    bind:this={tipEl}
    class="tooltip"
    role="tooltip"
    style="left: {pos.x}px; top: {pos.y}px"
    data-testid="tooltip"
  >
    {text}
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 80;
    max-width: 280px;
    padding: 5px 8px;
    border-radius: var(--ol-radius-sm);
    background: var(--ol-text);
    color: var(--ol-bg);
    font-size: var(--ol-fs-sm);
    font-weight: 500;
    line-height: 1.35;
    pointer-events: none;
    white-space: normal;
    box-shadow: var(--ol-shadow-pop);
  }
</style>
