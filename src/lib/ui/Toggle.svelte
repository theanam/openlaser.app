<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onchange: (checked: boolean) => void;
    testid?: string;
    /** What the switch does, shown as a tooltip when it is hovered. */
    hint?: string;
  }

  let { label, checked, disabled = false, onchange, testid, hint }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  class="toggle"
  aria-checked={checked}
  {disabled}
  data-testid={testid}
  title={hint}
  onclick={() => onchange(!checked)}
>
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class="label">{label}</span>
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ol-text-2);
    font-size: var(--ol-fs-sm);
    text-align: left;
  }

  .track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 999px;
    background: var(--ol-border-strong);
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--ol-text);
    transition: transform 0.15s;
  }

  [aria-checked='true'] .track {
    background: var(--ol-beam);
  }

  [aria-checked='true'] .thumb {
    transform: translateX(12px);
    background: var(--ol-bg);
  }
</style>
