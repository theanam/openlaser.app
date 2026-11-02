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
  import { connectedAdapter, shownAdapter } from '../machines/registry';
  import StatusBar from './StatusBar.svelte';
  import { untrack } from 'svelte';
  import { reorient } from '$lib/project/orientation';
  import { profiles } from '../state/profiles.svelte';
  import { fitToBed, type Area } from '$lib/project/fit';
  import { workArea } from '$lib/project/accessories';
  import { toast } from '$lib/ui/toasts.svelte';

  // The design keeps reading the right way up when the machine's home corner changes (switching
  // machines, editing the profile). A project without a recorded corner is taken as laid out for
  // the machine it is open on now: nothing moves, the corner is recorded.
  $effect(() => {
    const project = editor.project;
    if (!project || !profiles.loaded) return;
    const to = profiles.active.originCorner;
    if (project.designCorner === to) return;
    untrack(() => editor.commit((p) => reorient(p, to), { record: false }));
  });

  // Switching to a machine with a smaller work area brings what fitted on the old one along,
  // scaled down if it has to be. Fitting an accessory changes the area without refitting.
  let laidOut: { key: string; area: Area } | null = null;
  $effect(() => {
    const project = editor.project;
    if (!project || !profiles.loaded) return;
    const p = profiles.active;
    const key = `${p.id} ${p.bedWidth} ${p.bedHeight}`;
    const area = workArea(p, project.jobSettings);
    const before = laidOut;
    laidOut = { key, area };
    if (!before || before.key === key) return;
    untrack(() => {
      const fitted = fitToBed(project, before.area, area);
      if (!fitted) return;
      editor.commit(() => fitted);
      editor.sealHistory();
      toast.info('Design resized to fit the work area.');
    });
  });

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
  const live = $derived(connectedAdapter());
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
        <ErrorBoundary name="Machine"><MachinePanel /></ErrorBoundary>
        {#if editor.project}
          <ErrorBoundary name="Layers"><LayersPanel /></ErrorBoundary>
          <ErrorBoundary name="Inspector"><SelectionInspector /></ErrorBoundary>
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
      </div>
      {#if live?.controls}
        <ErrorBoundary name="Job controls" compact><live.controls /></ErrorBoundary>
      {/if}
      {#if shownAdapter().capabilities.console}
        <ErrorBoundary name="Console" compact><ConsolePanel /></ErrorBoundary>
      {/if}
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
