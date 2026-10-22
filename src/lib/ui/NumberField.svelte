<script lang="ts">
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import { DropdownMenu } from 'bits-ui';
  import { clamp, formatNumber, parseNumberInput, roundTo, scrubDelta, stepValue } from './number';

  interface Props {
    label: string;
    value: number;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    disabled?: boolean;
    /** Called with the clamped value on commit. `live` is true while scrubbing. */
    onchange: (value: number, live: boolean) => void;
    testid?: string;
    compact?: boolean;
    /** Up/down carets (on by default). */
    stepper?: boolean;
    /** Common values offered in a dropdown; typing any other value still works. */
    presets?: number[];
    /** How a preset reads in the dropdown, e.g. "Off" for 0. Defaults to value + unit. */
    presetLabel?: (value: number) => string;
    /** What the setting does, shown as a tooltip when the field is hovered. */
    hint?: string;
  }

  let {
    label,
    value,
    unit,
    min = -Infinity,
    max = Infinity,
    step = 1,
    decimals = 0,
    disabled = false,
    onchange,
    testid,
    compact = false,
    stepper = true,
    presets,
    presetLabel,
    hint,
  }: Props = $props();

  const showStepper = $derived(stepper);
  const hasPresets = $derived((presets?.length ?? 0) > 0);
  const stepLabel = $derived(formatNumber(step, decimals).replace(/\.?0+$/, '') || String(step));

  /** Hold to repeat: first step at once, then every 60 ms after a short pause. One undo step per press. */
  function startStep(event: PointerEvent, direction: 1 | -1) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const button = event.currentTarget as HTMLElement;
    button.setPointerCapture(event.pointerId);
    const start = value;
    let current = value;
    const tick = () => {
      const next = stepValue(current, step, direction, {
        shift: event.shiftKey,
        alt: event.altKey,
        min,
        max,
        decimals,
      });
      if (next === current) return;
      current = next;
      onchange(next, true);
      if (editing) draft = formatNumber(next, decimals);
    };
    tick();
    let repeat: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => (repeat = setInterval(tick, 60)), 400);
    const stop = () => {
      clearTimeout(delay);
      if (repeat) clearInterval(repeat);
      button.removeEventListener('pointerup', stop);
      button.removeEventListener('pointercancel', stop);
      if (current !== start) onchange(current, false);
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
  }

  let editing = $state(false);
  let draft = $state('');
  let invalid = $state(false);
  const id = `nf-${Math.random().toString(36).slice(2, 9)}`;

  const shown = $derived(editing ? draft : formatNumber(value, decimals));

  function commit() {
    const parsed = parseNumberInput(draft);
    editing = false;
    if (parsed === null) {
      invalid = false;
      return;
    }
    const next = roundTo(clamp(parsed, min, max), decimals);
    if (next !== value) onchange(next, false);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      commit();
      (event.currentTarget as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      editing = false;
      (event.currentTarget as HTMLInputElement).blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = stepValue(value, step, event.key === 'ArrowUp' ? 1 : -1, {
        shift: event.shiftKey,
        alt: event.altKey,
        min,
        max,
        decimals,
      });
      onchange(next, false);
      draft = formatNumber(next, decimals);
    }
  }

  function oninput(event: Event) {
    draft = (event.currentTarget as HTMLInputElement).value;
    invalid = parseNumberInput(draft) === null;
  }

  function startScrub(event: PointerEvent) {
    if (disabled || event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startValue = value;
    let last = value;
    const move = (e: PointerEvent) => {
      const next = roundTo(
        clamp(
          startValue + scrubDelta(e.clientX - startX, step, { shift: e.shiftKey, alt: e.altKey }),
          min,
          max,
        ),
        decimals,
      );
      if (next !== last) {
        last = next;
        onchange(next, true);
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (last !== startValue) onchange(last, false);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }
</script>

<div class="nf" class:compact class:stepped={showStepper} class:presets={hasPresets} title={hint}>
  <label for={id} class="nf-label" class:scrub={!disabled} onpointerdown={startScrub}>{label}</label>
  <span class="nf-wrap">
    <input
      {id}
      class="nf-input mono"
      class:invalid
      type="text"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      value={shown}
      {disabled}
      data-testid={testid}
      aria-invalid={invalid}
      onfocus={(e) => {
        editing = true;
        draft = formatNumber(value, decimals);
        invalid = false;
        (e.currentTarget as HTMLInputElement).select();
      }}
      onblur={commit}
      {oninput}
      {onkeydown}
    />
    {#if unit && !hasPresets}<span class="nf-unit mono" aria-hidden="true">{unit}</span>{/if}
    {#if hasPresets && presets}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="nf-preset"
          aria-label="{label} presets"
          data-tip="Common values"
          {disabled}
          data-testid={testid ? `${testid}-presets` : undefined}
        >
          <span class="mono">{unit ?? ''}</span><ChevronDown size={11} strokeWidth={2.5} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="ol-menu nf-preset-menu" sideOffset={4} align="end">
            {#each presets as p (p)}
              <DropdownMenu.Item
                class="ol-menu-item"
                onSelect={() => onchange(roundTo(clamp(p, min, max), decimals), false)}
              >
                <span class="mono"
                  >{presetLabel ? presetLabel(p) : `${formatNumber(p, decimals)}${unit ?? ''}`}</span
                >
                {#if Math.abs(p - value) < 1e-9}<Check size={14} />{/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}
    {#if showStepper}
      <span class="nf-steps">
        <button
          type="button"
          tabindex="-1"
          class="nf-step"
          aria-label="Increase {label} by {stepLabel}"
          data-tip="+{stepLabel} · Shift ×10 · Alt ×0.1"
          {disabled}
          onpointerdown={(e) => startStep(e, 1)}
          data-testid={testid ? `${testid}-up` : undefined}><ChevronUp size={11} strokeWidth={2.5} /></button
        >
        <button
          type="button"
          tabindex="-1"
          class="nf-step"
          aria-label="Decrease {label} by {stepLabel}"
          data-tip="−{stepLabel} · Shift ×10 · Alt ×0.1"
          {disabled}
          onpointerdown={(e) => startStep(e, -1)}
          data-testid={testid ? `${testid}-down` : undefined}
          ><ChevronDown size={11} strokeWidth={2.5} /></button
        >
      </span>
    {/if}
  </span>
</div>

<style>
  .nf {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .nf-label {
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
    user-select: none;
    touch-action: none;
  }

  .nf-label.scrub {
    cursor: ew-resize;
  }

  .nf-wrap {
    position: relative;
    display: block;
  }

  .nf-input {
    width: 100%;
    height: var(--ol-control-h);
    border-radius: 8px;
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    color: var(--ol-text);
    font-size: var(--ol-fs-md);
    font-weight: 500;
    padding: 0 52px 0 10px;
  }

  .compact .nf-input {
    height: 30px;
    padding-right: 30px;
  }

  .nf-input:focus {
    outline: 2px solid var(--ol-beam);
    outline-offset: 1px;
  }

  .nf-input.invalid {
    border-color: var(--ol-hold);
  }

  .stepped .nf-input {
    padding-right: 66px;
  }

  .stepped.compact .nf-input {
    padding-right: 44px;
  }

  .nf-steps {
    position: absolute;
    top: 3px;
    bottom: 3px;
    right: 3px;
    width: 16px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nf-step {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--ol-text-dim);
    touch-action: none;
  }

  .nf-step:hover:not(:disabled) {
    background: var(--ol-surface-2);
    color: var(--ol-text);
  }

  .nf-step:active:not(:disabled) {
    background: var(--ol-border);
  }

  .stepped .nf-unit {
    right: 24px;
  }

  .presets.stepped .nf-input {
    padding-right: 72px;
  }

  :global(.nf-preset) {
    position: absolute;
    top: 50%;
    right: 22px;
    transform: translateY(-50%);
    height: 24px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px 0 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ol-text-dim);
    font-size: var(--ol-fs-xs);
  }

  :global(.nf-preset:hover:not(:disabled)),
  :global(.nf-preset[data-state='open']) {
    background: var(--ol-surface-2);
    color: var(--ol-text);
  }

  :global(.nf-preset-menu) {
    min-width: 120px !important;
    max-height: 280px;
    overflow-y: auto;
  }

  .nf-unit {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-dim);
    pointer-events: none;
  }
</style>
