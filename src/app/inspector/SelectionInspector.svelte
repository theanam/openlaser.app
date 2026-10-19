<script lang="ts">
  import type { ImageObject, ShapeSpec, TextObject, VectorObject } from '$lib/project/types';
  import ImageInspector from './ImageInspector.svelte';
  import { editor } from '../state/editor.svelte';
  import ShapeInspector from './ShapeInspector.svelte';
  import TextInspector from './TextInspector.svelte';

  /** Settings for the one selected object when it has any: text style or shape parameters. */
  const single = $derived(
    editor.selection.size === 1 && editor.view === 'design'
      ? (editor.project?.objects.find((o) => editor.selection.has(o.id)) ?? null)
      : null,
  );
  const text = $derived(single?.kind === 'text' ? (single as TextObject) : null);
  const image = $derived(single?.kind === 'image' ? (single as ImageObject) : null);
  const shape = $derived(
    single?.kind === 'vector' && single.shape ? (single as VectorObject & { shape: ShapeSpec }) : null,
  );
</script>

{#if text}
  {#key text.id}<TextInspector object={text} />{/key}
{:else if shape}
  {#key shape.id}<ShapeInspector object={shape} />{/key}
{:else if image}
  {#key image.id}<ImageInspector object={image} />{/key}
{/if}
