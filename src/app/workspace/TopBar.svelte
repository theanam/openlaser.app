<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Save from '@lucide/svelte/icons/save';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import Redo2 from '@lucide/svelte/icons/redo-2';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Printer from '@lucide/svelte/icons/printer';
  import FileCode from '@lucide/svelte/icons/file-code';
  import Logo from '$lib/ui/Logo.svelte';
  import GithubMark from '$lib/ui/GithubMark.svelte';
  import { REPO_URL } from '$lib/config/app';
  import { formatCombo } from '../lib/keys';
  import { editor } from '../state/editor.svelte';
  import { session } from '../state/session.svelte';
  import { route } from '../state/route.svelte';
  import { ui } from '../state/ui.svelte';
  import * as actions from '../actions';

  const saveState = $derived(
    editor.gcode
      ? 'G-code file'
      : session.autosave === 'error'
        ? 'Autosave failed'
        : editor.dirty
          ? editor.fileName
            ? 'Unsaved changes'
            : session.autosave === 'pending'
              ? 'Saving…'
              : 'Saved in browser'
          : 'Saved',
  );

  let editingName = $state(false);

  function rename(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    editingName = false;
    if (value && editor.project && value !== editor.project.name) {
      editor.commit((p) => ({ ...p, name: value }));
    }
  }

  const menu: Array<{ label: string; keys?: string; run: () => void; projectOnly?: boolean } | 'separator'> =
    [
      { label: 'New project', keys: 'Mod+N', run: () => actions.newProject() },
      { label: 'Open project or G-code…', keys: 'Mod+O', run: () => actions.openFile() },
      { label: 'Save as…', keys: 'Mod+Shift+S', run: () => actions.saveProjectAs(), projectOnly: true },
      { label: 'Send G-code file…', run: () => actions.openGcodeFile() },
      { label: 'Print template…', keys: 'Mod+P', run: () => actions.printDesign(), projectOnly: true },
      {
        label: 'Trace image…',
        keys: 'Shift+T',
        run: () => actions.traceSelectedImage(),
        projectOnly: true,
      },
      'separator',
      { label: 'Machine profiles', run: () => (ui.profilesOpen = true) },
      { label: 'Device settings ($$)', run: () => (ui.deviceSettingsOpen = true) },
      { label: 'Preferences', run: () => (ui.preferencesOpen = true) },
      { label: 'Keyboard shortcuts', keys: '?', run: () => (ui.shortcutsOpen = true) },
      'separator',
      { label: 'Take the tour', run: () => (ui.tourOpen = true) },
      { label: 'About', run: () => route.go('about') },
      { label: 'Close project', run: () => actions.closeDocument() },
    ];
</script>

<header class="topbar">
  <button
    type="button"
    class="home"
    onclick={() => actions.closeDocument()}
    aria-label="Back to start"
    title="Back to start"
  >
    <Logo size={28} />
  </button>
  <div class="divider-v"></div>

  <div class="doc">
    {#if editor.project}
      {#if editingName}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="name-input"
          value={editor.project.name}
          aria-label="Project name"
          autofocus
          onblur={rename}
          onkeydown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') editingName = false;
          }}
        />
      {:else}
        <button
          type="button"
          class="name"
          onclick={() => (editingName = true)}
          title="Rename project"
          data-testid="project-name"
        >
          {editor.project.name}
        </button>
      {/if}
    {:else if editor.gcode}
      <FileCode size={16} />
      <span class="name static">{editor.gcode.name}</span>
    {/if}
    <span class="save-state" class:warn={session.autosave === 'error'}>{saveState}</span>
  </div>

  <div class="group">
    <button
      type="button"
      class="icon-btn"
      aria-label="Open project or G-code"
      title="Open project or G-code ({formatCombo('Mod+O')})"
      onclick={() => actions.openFile()}
    >
      <FolderOpen size={18} />
    </button>
    <button
      type="button"
      class="icon-btn"
      aria-label="Save project"
      title="Save project ({formatCombo('Mod+S')})"
      disabled={!editor.project}
      onclick={() => actions.saveProject()}
      data-testid="save-project"
    >
      <Save size={18} />
    </button>
    <div class="divider-v gap"></div>
    <button
      type="button"
      class="icon-btn"
      aria-label="Undo"
      title="Undo ({formatCombo('Mod+Z')})"
      disabled={!editor.canUndo}
      onclick={() => editor.undo()}
    >
      <Undo2 size={18} />
    </button>
    <button
      type="button"
      class="icon-btn"
      aria-label="Redo"
      title="Redo ({formatCombo('Mod+Shift+Z')})"
      disabled={!editor.canRedo}
      onclick={() => editor.redo()}
    >
      <Redo2 size={18} />
    </button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="icon-btn" aria-label="More" title="More">
        <Ellipsis size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="ol-menu" sideOffset={6} align="start">
          {#each menu as item, i (i)}
            {#if item === 'separator'}
              <DropdownMenu.Separator class="ol-menu-sep" />
            {:else}
              <DropdownMenu.Item
                class="ol-menu-item"
                disabled={item.projectOnly && !editor.project}
                onSelect={item.run}
              >
                <span>{item.label}</span>
                {#if item.keys}<span class="ol-menu-keys mono">{formatCombo(item.keys)}</span>{/if}
              </DropdownMenu.Item>
            {/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>

  <div class="spacer"></div>

  <div class="segmented view" role="group" aria-label="View">
    <button
      type="button"
      aria-pressed={editor.view === 'design'}
      disabled={!editor.project}
      onclick={() => (editor.view = 'design')}
      data-testid="view-design"
    >
      Design
    </button>
    <button
      type="button"
      aria-pressed={editor.view === 'preview'}
      onclick={() => (editor.view = 'preview')}
      data-testid="view-preview">Preview</button
    >
  </div>
  <button
    type="button"
    class="btn ghost"
    onclick={() => actions.exportGcode()}
    title="Export G-code ({formatCombo('Mod+E')})"
    data-testid="export-gcode"
  >
    Export G-code
  </button>
  <button
    type="button"
    class="icon-btn"
    aria-label="Print template"
    title="Print template ({formatCombo('Mod+P')})"
    disabled={!editor.project}
    onclick={() => actions.printDesign()}
  >
    <Printer size={18} />
  </button>
  <button type="button" class="icon-btn" aria-label="Help" title="Help" onclick={() => route.go('help')}>
    <CircleHelp size={18} />
  </button>
  <a
    class="icon-btn"
    href={REPO_URL}
    target="_blank"
    rel="noopener"
    aria-label="openlaser on GitHub"
    title="GitHub"
  >
    <GithubMark />
  </a>
</header>

<style>
  .topbar {
    height: var(--ol-topbar-h);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px 0 14px;
    border-bottom: 1px solid var(--ol-border);
    background: var(--ol-surface);
    min-width: 0;
  }

  .home {
    display: flex;
    border: 0;
    background: none;
    padding: 2px;
    border-radius: var(--ol-radius-md);
    color: var(--ol-text);
  }

  .doc {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .name {
    border: 0;
    background: none;
    padding: 4px 6px;
    margin-left: -6px;
    border-radius: 6px;
    font-weight: 500;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name:hover:not(.static) {
    background: var(--ol-surface-2);
  }

  .name-input {
    height: 30px;
    width: 200px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid var(--ol-beam);
    background: var(--ol-bg);
    font-weight: 500;
  }

  .save-state {
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
    white-space: nowrap;
  }

  .save-state.warn {
    color: var(--ol-hold);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
  }

  .divider-v.gap {
    margin: 0 6px;
  }

  .spacer {
    flex-grow: 1;
  }

  .view button {
    font-size: var(--ol-fs-md);
    padding: 0 14px;
  }

  :global(.ol-menu) {
    z-index: 55;
    min-width: 240px;
    padding: 6px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-surface);
    border: 1px solid var(--ol-border-strong);
    box-shadow: var(--ol-shadow-pop);
    outline: none;
  }

  :global(.ol-menu-item) {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 10px;
    border-radius: var(--ol-radius-sm);
    cursor: pointer;
    outline: none;
  }

  :global(.ol-menu-item[data-highlighted]) {
    background: var(--ol-surface-2);
  }

  :global(.ol-menu-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.ol-menu-keys) {
    color: var(--ol-text-dim);
    font-size: var(--ol-fs-sm);
  }

  :global(.ol-menu-sep) {
    height: 1px;
    margin: 4px 0;
    background: var(--ol-border);
  }
</style>
