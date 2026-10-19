<script lang="ts">
  import FileCode from '@lucide/svelte/icons/file-code';
  import X from '@lucide/svelte/icons/x';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import CanvasView from '../canvas/CanvasView.svelte';
  import { count } from '../lib/format';
  import { editor } from '../state/editor.svelte';
  import { preview } from '../state/preview.svelte';
  import * as actions from '../actions';
  import TopBar from './TopBar.svelte';
  import ToolRail from './ToolRail.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import PreviewBar from './PreviewBar.svelte';
  import LayersPanel from './LayersPanel.svelte';
  import SelectionInspector from '../inspector/SelectionInspector.svelte';
  import { textOutlines } from '../state/text.svelte';
  import MachinePanel from '../machine/MachinePanel.svelte';
  import ConsolePanel from '../machine/ConsolePanel.svelte';
  import JobControls from '../machine/JobControls.svelte';
  import { machine } from '../state/machine.svelte';
  import StatusBar from './StatusBar.svelte';

  // Text from opened projects gets its outlines as soon as its fonts are reachable.
  $effect(() => {
    if (editor.project) textOutlines.ensureAll(editor.project);
  });

  // Keep the compiled job fresh while Preview is visible.
  $effect(() => {
    if (editor.view === 'preview' && editor.project) {
      void preview.stale;
      preview.schedule();
    }
  });

  const bounds = $derived(editor.gcode?.moves.bounds);
</script>

<div class="workspace" data-testid="workspace">
  <ErrorBoundary name="Top bar" compact><TopBar /></ErrorBoundary>
  <div class="body">
    <ErrorBoundary name="Tools" compact><ToolRail /></ErrorBoundary>
    <main class="center">
      {#if editor.project && editor.view === 'design'}
        <ErrorBoundary name="Selection bar" compact><SelectionBar /></ErrorBoundary>
      {/if}
      <ErrorBoundary name="Canvas"><CanvasView /></ErrorBoundary>
      {#if editor.view === 'preview' || editor.gcode}
        <ErrorBoundary name="Preview" compact><PreviewBar /></ErrorBoundary>
      {/if}
    </main>
    <aside class="side">
      <div class="side-scroll">
        {#if editor.project}
          <ErrorBoundary name="Inspector"><SelectionInspector /></ErrorBoundary>
          <ErrorBoundary name="Layers"><LayersPanel /></ErrorBoundary>
        {:else if editor.gcode}
          <section class="gcode-card" aria-label="G-code file">
            <FileCode size={18} />
            <div class="gcode-text">
              <span class="gcode-name">{editor.gcode.name}</span>
              <span class="mono muted small">
                {count(editor.gcode.lines.length)} lines{#if bounds}
                  · {Math.round(bounds.maxX - bounds.minX)} × {Math.round(bounds.maxY - bounds.minY)} mm{/if}
              </span>
            </div>
            <button
              type="button"
              class="icon-btn sm"
              aria-label="Close G-code file"
              onclick={() => actions.closeDocument()}><X size={16} /></button
            >
          </section>
        {/if}
        <ErrorBoundary name="Machine"><MachinePanel /></ErrorBoundary>
      </div>
      {#if machine.connected}
        <JobControls />
      {/if}
      <ErrorBoundary name="Console" compact><ConsolePanel /></ErrorBoundary>
    </aside>
  </div>
  <footer class="foot">
    <ErrorBoundary name="Status bar" compact><StatusBar /></ErrorBoundary>
  </footer>
</div>

<style>
  .workspace {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--ol-bg);
    min-width: 1100px;
  }

  .body {
    flex-grow: 1;
    display: flex;
    min-height: 0;
  }

  .center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .side {
    width: 360px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--ol-border);
    background: var(--ol-surface);
    min-height: 0;
  }

  .side-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .gcode-card {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 16px;
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
  }

  .gcode-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gcode-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  .foot {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--ol-border);
    background: var(--ol-surface);
  }
</style>
