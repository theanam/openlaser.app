<script lang="ts">
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import Dialog from '$lib/ui/Dialog.svelte';
  import { confirm } from '$lib/ui/confirm.svelte';
  import { toast } from '$lib/ui/toasts.svelte';
  import { errorMessage } from '$lib/ui/errors';
  import { GRBL_SETTINGS } from '$lib/machine';
  import { MACHINE_FILES, openFiles, saveFileAs } from '$lib/storage/files';
  import { machine } from '../state/machine.svelte';
  import { ui } from '../state/ui.svelte';
  import { parseSettingsBackup, settingsBackup } from '../lib/settings-backup';

  let edits = $state<Record<number, string>>({});
  let busy = $state(false);
  const settings = $derived(machine.state.settings);
  const rows = $derived(
    Object.keys(settings)
      .map(Number)
      .sort((a, b) => a - b)
      .map((n) => ({ n, value: settings[n], info: GRBL_SETTINGS.get(n) })),
  );
  const changed = $derived(Object.entries(edits).filter(([n, v]) => settings[Number(n)] !== v));

  async function refresh() {
    if (!machine.driver) return;
    busy = true;
    try {
      await machine.driver.readSettings();
      edits = {};
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      busy = false;
    }
  }

  async function write(entries: Array<[string, string]>) {
    if (!machine.driver || entries.length === 0) return;
    const ok = await confirm({
      title: `Write ${entries.length} ${entries.length === 1 ? 'setting' : 'settings'}?`,
      message: entries.map(([n, v]) => `$${n}: ${settings[Number(n)] ?? '—'} → ${v}`).join('\n'),
      confirmLabel: 'Write to machine',
      tone: 'danger',
    });
    if (!ok) return;
    busy = true;
    try {
      for (const [n, v] of entries) await machine.driver.writeSetting(Number(n), v);
      await machine.driver.readSettings();
      edits = {};
      toast.success('Settings written');
    } catch (error) {
      toast.error(`Could not write settings: ${errorMessage(error)}`);
    } finally {
      busy = false;
    }
  }

  async function backup() {
    const blob = new Blob([settingsBackup(settings, machine.state.firmware)], { type: 'application/json' });
    const outcome = await saveFileAs(
      `grbl-settings-${new Date().toISOString().slice(0, 10)}.json`,
      blob,
      MACHINE_FILES,
      { id: 'grbl-settings' },
    );
    if (outcome.status === 'saved' || outcome.status === 'downloaded') toast.success('Settings backed up');
  }

  async function restore() {
    try {
      const [file] = await openFiles([MACHINE_FILES], { id: 'grbl-settings' });
      if (!file) return;
      const values = parseSettingsBackup(await file.file.text());
      await write(Object.entries(values).filter(([n, v]) => settings[Number(n)] !== v));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
</script>

<Dialog
  bind:open={ui.deviceSettingsOpen}
  title="Device settings ($$)"
  width={640}
  testid="device-settings-dialog"
>
  {#if !machine.connected}
    <p class="muted">Connect a machine to view its settings.</p>
  {:else}
    <div class="actions">
      <button type="button" class="btn small" disabled={busy || machine.jobActive} onclick={refresh}
        ><RefreshCw size={14} />Read</button
      >
      <button type="button" class="btn small" onclick={backup}><Download size={14} />Back up</button>
      <button type="button" class="btn small" disabled={busy || machine.jobActive} onclick={restore}
        ><Upload size={14} />Restore</button
      >
    </div>
    <div class="table">
      {#each rows as row (row.n)}
        <label class="row" class:edited={edits[row.n] !== undefined && edits[row.n] !== row.value}>
          <span class="mono n">${row.n}</span>
          <span class="name">{row.info?.name ?? 'Unknown setting'}</span>
          <input
            class="input mono"
            value={edits[row.n] ?? row.value}
            disabled={machine.jobActive}
            oninput={(e) => (edits[row.n] = e.currentTarget.value.trim())}
            aria-label="${row.n} {row.info?.name ?? ''}"
          />
          <span class="mono dim unit">{row.info?.unit ?? ''}</span>
        </label>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (ui.deviceSettingsOpen = false)}>Close</button>
    <button
      type="button"
      class="btn start"
      disabled={changed.length === 0 || busy}
      onclick={() => write(changed)}>Write {changed.length || ''}</button
    >
  {/snippet}
</Dialog>

<style>
  .actions {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .table {
    display: flex;
    flex-direction: column;
    max-height: 52vh;
    overflow: auto;
  }

  .row {
    display: grid;
    grid-template-columns: 52px 1fr 120px 60px;
    gap: 10px;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid var(--ol-border);
  }

  .row.edited .n {
    color: var(--ol-hold);
  }

  .row .input {
    height: 30px;
  }

  .unit {
    font-size: var(--ol-fs-xs);
  }
</style>
