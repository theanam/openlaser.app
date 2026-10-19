<script lang="ts">
  import { shapeDef, shapeGlyphPath, type ShapeKind } from '$lib/shapes';

  let { kind, size = 20 }: { kind: ShapeKind; size?: number } = $props();
  const open = $derived(!!shapeDef(kind).open);
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  <path
    d={shapeGlyphPath(kind)}
    fill-rule="evenodd"
    fill={open ? 'none' : 'currentColor'}
    fill-opacity={open ? undefined : 0.18}
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
</svg>
