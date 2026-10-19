<script lang="ts">
  import { Popover } from 'bits-ui';
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
  import Hand from '@lucide/svelte/icons/hand';
  import Square from '@lucide/svelte/icons/square';
  import Circle from '@lucide/svelte/icons/circle';
  import Type from '@lucide/svelte/icons/type';
  import Ruler from '@lucide/svelte/icons/ruler';
  import ImagePlus from '@lucide/svelte/icons/image-plus';
  import * as actions from '../actions';
  import type { Component } from 'svelte';
  import { isShapeKind, shapeDef } from '$lib/shapes';
  import { formatCombo } from '../lib/keys';
  import { editor, type Tool } from '../state/editor.svelte';
  import ShapeGlyph from '../inspector/ShapeGlyph.svelte';
  import ShapePicker from '../inspector/ShapePicker.svelte';

  type Entry =
    | { id: Tool; label: string; key: string; icon: Component; design: boolean }
    | 'divider'
    | 'shapes'
    | 'image';

  const tools: Entry[] = [
    { id: 'select', label: 'Select', key: 'V', icon: MousePointer2, design: true },
    { id: 'pan', label: 'Pan', key: 'H', icon: Hand, design: false },
    'divider',
    { id: 'rect', label: 'Rectangle', key: 'R', icon: Square, design: true },
    { id: 'ellipse', label: 'Ellipse', key: 'E', icon: Circle, design: true },
    'shapes',
    { id: 'text', label: 'Text', key: 'T', icon: Type, design: true },
    'image',
    { id: 'measure', label: 'Measure', key: 'M', icon: Ruler, design: false },
  ];

  const designing = $derived(editor.view === 'design' && editor.project !== null);
  const shapeKind = $derived(isShapeKind(editor.shapeKind) ? editor.shapeKind : 'star');
  let pickerOpen = $state(false);
</script>

<nav class="rail" aria-label="Tools">
  {#each tools as tool, i (i)}
    {#if tool === 'divider'}
      <div class="rule"></div>
    {:else if tool === 'image'}
      <button
        type="button"
        class="icon-btn tool"
        aria-label="Image: SVG, DXF, PNG, JPEG, WebP, AVIF, BMP, GIF ({formatCombo('Mod+I')})"
        disabled={!designing}
        onclick={() => actions.importArt()}
        data-testid="tool-image"><ImagePlus size={18} /></button
      >
    {:else if tool === 'shapes'}
      <Popover.Root bind:open={pickerOpen}>
        <Popover.Trigger
          class="icon-btn tool"
          aria-label="Shapes: {shapeDef(shapeKind).label} ({formatCombo('S')})"
          aria-pressed={editor.tool === 'shape'}
          disabled={!designing}
          onclick={() => (editor.tool = 'shape')}
          data-testid="tool-shape"
        >
          <ShapeGlyph kind={shapeKind} size={20} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content class="ol-menu" side="right" align="start" sideOffset={8}>
            <ShapePicker
              value={shapeKind}
              onpick={(kind) => {
                editor.shapeKind = kind;
                editor.tool = 'shape';
                pickerOpen = false;
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {:else}
      <button
        type="button"
        class="icon-btn tool"
        aria-label="{tool.label} ({formatCombo(tool.key)})"
        aria-pressed={editor.tool === tool.id}
        disabled={tool.design && !designing}
        onclick={() => (editor.tool = tool.id)}
        data-testid="tool-{tool.id}"
      >
        <tool.icon size={18} />
      </button>
    {/if}
  {/each}
</nav>

<style>
  .rail {
    width: var(--ol-toolrail-w);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 0;
    border-right: 1px solid var(--ol-border);
    background: var(--ol-surface);
  }

  .rail :global(.tool) {
    width: 40px;
    height: 40px;
  }

  .rule {
    width: 24px;
    height: 1px;
    background: var(--ol-border);
    margin: 6px 0;
  }
</style>
