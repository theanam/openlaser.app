<script lang="ts">
  import { tick } from 'svelte';
  import { cssFamilyFor, findFont } from '$lib/fonts/catalog';
  import { ensureFont } from '$lib/fonts/loader';
  import { removeObjects } from '$lib/project/operations';
  import type { TextObject } from '$lib/project/types';
  import { canvas } from '../state/canvas.svelte';
  import { editor } from '../state/editor.svelte';
  import { fonts } from '../state/fonts.svelte';
  import { textOutlines } from '../state/text.svelte';
  import { inkOn } from './ink';
  import { textEditBox } from './text-edit';
  import { bedToScreenMatrix, type BedFrame } from './viewport';

  /** Edits a text object right on the bed: a textarea laid exactly over its outlines. */
  let { bed, bedColor }: { bed: BedFrame; bedColor: string } = $props();

  let field = $state<HTMLTextAreaElement | null>(null);

  const object = $derived(
    editor.project?.objects.find(
      (o): o is TextObject => o.id === canvas.editingTextId && o.kind === 'text',
    ) ?? null,
  );
  const layer = $derived(object ? editor.project?.layers.find((l) => l.id === object.layerId) : undefined);
  const box = $derived(object ? textEditBox(object, bedToScreenMatrix(canvas.view, bed)) : null);
  const family = $derived.by(() => {
    if (!object) return '';
    const entry = findFont(fonts.all, object.fontFamily);
    return entry?.bundled ? cssFamilyFor(entry, object.fontWeight) : object.fontFamily;
  });

  // Starts editing: load the face for display, focus, and select all of a fresh placeholder.
  let started: string | null = null;
  $effect(() => {
    const id = canvas.editingTextId;
    if (!id || id === started) return;
    started = id;
    if (object)
      void ensureFont({
        family: object.fontFamily,
        weight: object.fontWeight,
        style: object.italic ? 'italic' : 'normal',
      });
    void tick().then(() => {
      field?.focus({ preventScroll: true });
      if (canvas.selectTextOnEdit) field?.select();
      else field?.setSelectionRange(field.value.length, field.value.length);
    });
  });

  // The object went away (undo, delete): stop editing.
  $effect(() => {
    if (canvas.editingTextId && !object) finish();
  });

  function finish() {
    const id = canvas.editingTextId;
    canvas.editingTextId = null;
    started = null;
    if (!id) return;
    const current = editor.project?.objects.find((o) => o.id === id);
    // A text emptied in place disappears, as in any drawing app.
    if (current?.kind === 'text' && !current.text.trim()) {
      editor.commit((p) => removeObjects(p, new Set([id])), { coalesce: `text-${id}-text` });
      editor.clearSelection();
    }
    editor.sealHistory();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  }
</script>

{#if object && box}
  <textarea
    bind:this={field}
    class="text-edit"
    value={object.text}
    spellcheck="false"
    rows={1}
    aria-label="Edit text"
    data-testid="text-edit"
    style:transform="{box.transform} translateY({box.shiftPx}px)"
    style:font-family="'{family}', var(--ol-font)"
    style:font-size="{box.fontSizePx}px"
    style:line-height="{box.lineHeightPx}px"
    style:font-weight={object.fontWeight}
    style:font-style={object.italic ? 'italic' : 'normal'}
    style:letter-spacing="{box.letterSpacingEm}em"
    style:text-align={object.align}
    style:color={inkOn(layer?.color ?? '#888888', bedColor)}
    oninput={(e) =>
      textOutlines.update(object.id, { text: e.currentTarget.value }, { live: true, field: 'text' })}
    onblur={finish}
    {onkeydown}
  ></textarea>
{/if}

<style>
  .text-edit {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    field-sizing: content;
    min-width: 0.5em;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    caret-color: var(--ol-beam);
    resize: none;
    overflow: hidden;
    white-space: pre;
    font-kerning: normal;
  }

  .text-edit::selection {
    background: color-mix(in srgb, var(--ol-beam) 35%, transparent);
  }
</style>
