<script lang="ts">
  import Terminal from '@lucide/svelte/icons/terminal';
  import Copy from '@lucide/svelte/icons/copy';
  import Download from '@lucide/svelte/icons/download';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Filter from '@lucide/svelte/icons/filter';
  import ChevronsDown from '@lucide/svelte/icons/chevrons-down';
  import { tick } from 'svelte';
  import { formatConsoleReport, formatConsoleText, type ConsoleEntry } from '$lib/machine';
  import { APP_NAME, APP_VERSION } from '$lib/config/app';
  import { downloadBlob } from '$lib/storage/files';
  import { toast } from '$lib/ui/toasts.svelte';
  import { machine } from '../state/machine.svelte';
  import { preferences } from '../state/preferences.svelte';

  /** Always on screen at the bottom of the side panel: every line to and from the machine. */
  let command = $state('');
  let history: string[] = [];
  let historyIndex = -1;
  let list = $state<HTMLDivElement | null>(null);
  let height = $state(140);

  function startResize(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = height;
    const move = (e: PointerEvent) => {
      height = Math.min(window.innerHeight * 0.6, Math.max(80, startHeight + startY - e.clientY));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  const quiet = $derived(preferences.value.quietConsole);
  const visible = $derived(
    quiet
      ? machine.consoleEntries.filter((e) => e.kind !== 'status' && e.kind !== 'ok')
      : machine.consoleEntries,
  );

  const autoScroll = $derived(preferences.value.consoleAutoScroll);

  // Follow the newest line. Keyed on the last entry: the count stops changing once the log is full.
  $effect(() => {
    void visible.at(-1)?.id;
    if (!autoScroll || !list) return;
    void tick().then(() => list && (list.scrollTop = list.scrollHeight));
  });

  const arrow = (e: ConsoleEntry) => (e.direction === 'sent' ? '→' : e.direction === 'received' ? '←' : '·');
  const tone = (e: ConsoleEntry) =>
    e.direction === 'sent'
      ? 'sent'
      : e.kind === 'ok'
        ? 'ok'
        : e.kind === 'error' || e.kind === 'alarm'
          ? 'error'
          : 'info';

  async function send() {
    const line = command.trim();
    if (!line) return;
    history = [line, ...history.filter((h) => h !== line)].slice(0, 50);
    historyIndex = -1;
    command = '';
    await machine.sendManual(line);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') void send();
    else if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      historyIndex = Math.min(history.length - 1, historyIndex + 1);
      command = history[historyIndex];
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.max(-1, historyIndex - 1);
      command = historyIndex < 0 ? '' : history[historyIndex];
    }
  }

  function entries(): ConsoleEntry[] {
    return machine.driver?.console.entries() ?? machine.consoleEntries;
  }

  async function copy() {
    await navigator.clipboard.writeText(formatConsoleText(entries()));
    toast.success('Log copied');
  }

  function download() {
    const report = formatConsoleReport(entries(), {
      appName: APP_NAME,
      appVersion: APP_VERSION,
      userAgent: navigator.userAgent,
      firmware: machine.state.firmware,
      settings: machine.state.settings,
      generatedAt: Date.now(),
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadBlob(new Blob([report], { type: 'text/plain' }), `openlaser-log-${stamp}.txt`);
  }
</script>

<section class="console" aria-label="Console" data-testid="console">
  <div
    class="resize"
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize console"
    tabindex="-1"
    onpointerdown={startResize}
  ></div>
  <div class="head">
    <Terminal size={14} />
    <h2>Console</h2>
    <span class="spacer"></span>
    <button
      type="button"
      class="icon-btn sm"
      aria-label={quiet ? 'Show status reports and ok lines' : 'Hide status reports and ok lines'}
      aria-pressed={!quiet}
      onclick={() => preferences.update({ quietConsole: !quiet })}><Filter size={14} /></button
    >
    <button
      type="button"
      class="icon-btn sm"
      aria-label={autoScroll ? 'Auto-scroll: on' : 'Auto-scroll: off'}
      aria-pressed={autoScroll}
      onclick={() => preferences.update({ consoleAutoScroll: !autoScroll })}
      data-testid="console-autoscroll"><ChevronsDown size={15} /></button
    >
    <button type="button" class="icon-btn sm" aria-label="Copy log" onclick={copy}><Copy size={14} /></button>
    <button type="button" class="icon-btn sm" aria-label="Download log for bug reports" onclick={download}
      ><Download size={14} /></button
    >
    <button
      type="button"
      class="icon-btn sm"
      aria-label="Clear console"
      onclick={() => machine.clearConsole()}><Trash2 size={14} /></button
    >
  </div>
  <div class="log mono" bind:this={list} role="log" aria-live="off" style="height: {height}px">
    {#each visible as e (e.id)}
      <div class="entry {tone(e)}">{arrow(e)} {e.text}</div>
    {:else}
      <div class="empty">
        {machine.connected ? 'Waiting for messages…' : 'Connect a machine to see what it says.'}
      </div>
    {/each}
  </div>
  <div class="input-row">
    <span class="mono prompt">&gt;</span>
    <input
      class="cmd mono"
      placeholder={machine.connected ? 'G-code or $ command' : 'Not connected'}
      aria-label="Console command"
      bind:value={command}
      disabled={!machine.connected || machine.jobActive}
      {onkeydown}
      data-testid="console-input"
    />
  </div>
</section>

<style>
  .console {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--ol-border);
    background: var(--ol-surface);
  }

  .resize {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    touch-action: none;
    z-index: 1;
  }

  .resize:hover {
    background: var(--ol-beam);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 8px 0 16px;
    color: var(--ol-text-muted);
  }

  h2 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
    color: var(--ol-text);
  }

  .spacer {
    flex: 1;
  }

  .log {
    overflow: auto;
    padding: 6px 16px;
    font-size: var(--ol-fs-xs);
    line-height: 1.6;
    background: var(--ol-bg);
    border-top: 1px solid var(--ol-border);
  }

  .entry {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .empty {
    color: var(--ol-text-dim);
    font-family: var(--ol-font);
  }

  .sent {
    color: var(--ol-console-sent);
  }

  .ok {
    color: var(--ol-console-ok);
  }

  .info {
    color: var(--ol-console-status);
  }

  .error {
    color: var(--ol-console-error);
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    border-top: 1px solid var(--ol-border);
    background: var(--ol-bg);
  }

  .prompt {
    color: var(--ol-beam);
  }

  .cmd {
    flex: 1;
    height: 34px;
    border: 0;
    background: transparent;
    font-size: var(--ol-fs-sm);
    outline: none;
  }
</style>
