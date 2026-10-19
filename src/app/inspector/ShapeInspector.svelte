<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { updateObject } from '$lib/project/operations';
  import type { ShapeSpec, VectorObject } from '$lib/project/types';
  import { isShapeKind, shapeDef, shapePaths, type ParamDef } from '$lib/shapes';
  import { editor } from '../state/editor.svelte';
  import ShapeGlyph from './ShapeGlyph.svelte';

  let { object }: { object: VectorObject & { shape: ShapeSpec } } = $props();

  const kind = $derived(isShapeKind(object.shape.kind) ? object.shape.kind : null);
  const def = $derived(kind ? shapeDef(kind) : null);

  /** Display value: percents are stored as fractions (0.5 → 50 %). */
  function shown(p: ParamDef): number {
    const v = object.shape.params[p.key];
    const n = typeof v === 'number' ? v : p.type === 'bool' ? 0 : p.default;
    return p.type === 'percent' ? Math.round(n * 1000) / 10 : n;
  }

  function set(p: ParamDef, value: number | boolean, live: boolean) {
    if (!kind) return;
    const stored = p.type === 'percent' && typeof value === 'number' ? value / 100 : value;
    const params = { ...object.shape.params, [p.key]: stored };
    const shape = { ...object.shape, params };
    const paths = shapePaths(kind, shape.width, shape.height, params);
    const id = object.id;
    editor.commit((pr) => updateObject(pr, id, { shape, paths }), { coalesce: `shape-${id}-${p.key}` });
    if (!live) editor.sealHistory();
  }
</script>

{#if def && kind}
  <section class="shape" aria-label="Shape" data-testid="shape-inspector">
    <div class="head">
      <ShapeGlyph {kind} size={18} />
      <h2>{def.label}</h2>
    </div>
    {#if def.params.length}
      <div class="grid">
        {#each def.params as p (p.key)}
          {#if p.type === 'bool'}
            <Toggle
              label={p.label}
              checked={object.shape.params[p.key] === true}
              onchange={(c) => set(p, c, false)}
            />
          {:else if p.type === 'percent'}
            <NumberField
              label={p.label}
              unit="%"
              decimals={0}
              value={shown(p)}
              min={p.min}
              max={p.max}
              step={1}
              onchange={(v, live) => set(p, v, live)}
            />
          {:else if p.type === 'count'}
            <NumberField
              label={p.label}
              value={shown(p)}
              min={p.min}
              max={p.max}
              step={1}
              onchange={(v, live) => set(p, Math.round(v), live)}
            />
          {:else}
            <NumberField
              label={p.label}
              unit="°"
              value={shown(p)}
              min={p.min ?? -360}
              max={p.max ?? 360}
              step={1}
              onchange={(v, live) => set(p, v, live)}
            />
          {/if}
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .shape {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ol-text-muted);
  }

  h2 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
    color: var(--ol-text);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
</style>
