<script lang="ts">
  import { Popover } from 'bits-ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Upload from '@lucide/svelte/icons/upload';
  import Download from '@lucide/svelte/icons/download';
  import Check from '@lucide/svelte/icons/check';
  import Dialog from '$lib/ui/Dialog.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { confirm } from '$lib/ui/confirm.svelte';
  import { toast } from '$lib/ui/toasts.svelte';
  import { errorMessage } from '$lib/ui/errors';
  import { defaultMachineProfile, laserTypeDefaults, MAX_FRAME_POWER_PERCENT } from '$lib/project/factory';
  import { presetProfileFields, type MachinePreset } from '$lib/project/machine-presets';
  import PresetPicker from './PresetPicker.svelte';
  import { makeId } from '$lib/project/ids';
  import { parseMachineProfile, serializeMachineProfile } from '$lib/project/machine-file';
  import type { MachineProfile } from '$lib/project/types';
  import { MACHINE_FILES, openFiles, safeFileName, saveFileAs } from '$lib/storage/files';
  import { profiles } from '../state/profiles.svelte';
  import { ui } from '../state/ui.svelte';

  let selectedId = $state<string | null>(null);
  const selected = $derived(
    profiles.list.find((p) => p.id === (selectedId ?? profiles.activeId)) ?? profiles.active,
  );

  const ORIGINS: Array<{ id: MachineProfile['originCorner']; label: string }> = [
    { id: 'tl', label: 'Top left' },
    { id: 'tr', label: 'Top right' },
    { id: 'bl', label: 'Bottom left' },
    { id: 'br', label: 'Bottom right' },
  ];

  function patch(change: Partial<MachineProfile>) {
    void profiles.save({ ...selected, ...change });
  }

  let pickerOpen = $state(false);

  async function create(preset: MachinePreset) {
    pickerOpen = false;
    const profile = defaultMachineProfile(presetProfileFields(preset));
    await profiles.save(profile);
    selectedId = profile.id;
  }

  async function duplicate() {
    const copy = { ...selected, id: makeId(), name: `${selected.name} copy` };
    await profiles.save(copy);
    selectedId = copy.id;
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${selected.name}?`,
      message: 'Projects that used it switch to another profile.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    await profiles.remove(selected.id);
    selectedId = null;
  }

  async function importProfile() {
    try {
      const [file] = await openFiles([MACHINE_FILES], { id: 'machines' });
      if (!file) return;
      const profile = parseMachineProfile(await file.file.text());
      const imported = profiles.list.some((p) => p.id === profile.id)
        ? { ...profile, id: makeId() }
        : profile;
      await profiles.save(imported);
      selectedId = imported.id;
      toast.success(`Imported ${imported.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function exportProfile() {
    const blob = new Blob([serializeMachineProfile(selected)], { type: 'application/json' });
    const outcome = await saveFileAs(safeFileName(selected.name, '.json'), blob, MACHINE_FILES, {
      id: 'machines',
    });
    if (outcome.status === 'saved' || outcome.status === 'downloaded')
      toast.success(`Saved ${selected.name}`);
    else if (outcome.status === 'failed') toast.error(outcome.reason);
  }
  /** GRBL-only settings (S range, baud, jogging, framing, G-code) hide for Ruida machines. */
  const grbl = $derived(selected.controller === 'grbl');
</script>

<Dialog bind:open={ui.profilesOpen} title="Machine profiles" width={720} testid="profiles-dialog">
  <div class="layout">
    <div class="list">
      <ul>
        {#each profiles.list as p (p.id)}
          <li>
            <button
              type="button"
              class="item"
              class:on={p.id === selected.id}
              onclick={() => (selectedId = p.id)}
            >
              <span class="name">{p.name}</span>
              <span class="mono muted small">{p.bedWidth} × {p.bedHeight}</span>
              {#if p.id === profiles.activeId}<Check size={14} />{/if}
            </button>
          </li>
        {/each}
      </ul>
      <div class="list-actions">
        <Popover.Root bind:open={pickerOpen}>
          <Popover.Trigger class="icon-btn sm" aria-label="New profile from a machine" title="New profile"
            ><Plus size={16} /></Popover.Trigger
          >
          <Popover.Portal>
            <Popover.Content class="ol-menu preset-pop" sideOffset={6} align="start">
              <PresetPicker onselect={create} height={300} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Duplicate profile"
          title="Duplicate"
          onclick={duplicate}><Copy size={15} /></button
        >
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Import profile (.json)"
          title="Import .json"
          onclick={importProfile}><Upload size={15} /></button
        >
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Export profile (.json)"
          title="Export .json"
          onclick={exportProfile}><Download size={15} /></button
        >
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Delete profile"
          title="Delete"
          disabled={profiles.list.length <= 1}
          onclick={remove}><Trash2 size={15} /></button
        >
      </div>
    </div>

    {#key selected.id}
      <div class="editor">
        <label class="field"
          >Name<input
            class="input"
            value={selected.name}
            onchange={(e) => patch({ name: e.currentTarget.value.trim() || selected.name })}
          /></label
        >
        <div class="kinds">
          <div class="field">
            Laser
            <div class="segmented" role="group" aria-label="Laser type" data-testid="profile-laser-type">
              <button
                type="button"
                aria-pressed={selected.laserType === 'diode'}
                onclick={() => patch(laserTypeDefaults('diode'))}>Diode</button
              >
              <button
                type="button"
                aria-pressed={selected.laserType === 'co2'}
                onclick={() => patch(laserTypeDefaults('co2'))}>CO₂</button
              >
            </div>
          </div>
          <div class="field">
            Controller
            <div class="segmented" role="group" aria-label="Controller" data-testid="profile-controller">
              <button
                type="button"
                aria-pressed={selected.controller === 'grbl'}
                onclick={() => patch({ controller: 'grbl' })}>GRBL</button
              >
              <button
                type="button"
                aria-pressed={selected.controller === 'ruida'}
                onclick={() => patch({ controller: 'ruida', originCorner: 'tr' })}>Ruida</button
              >
            </div>
          </div>
          <div class="field">
            Speeds in
            <div class="segmented" role="group" aria-label="Speed unit">
              {#each ['mm/min', 'mm/s'] as const as unit (unit)}
                <button
                  type="button"
                  aria-pressed={selected.speedUnit === unit}
                  onclick={() => patch({ speedUnit: unit })}>{unit}</button
                >
              {/each}
            </div>
          </div>
        </div>
        <div class="grid">
          <NumberField
            label="Bed width"
            unit="mm"
            value={selected.bedWidth}
            min={10}
            max={3000}
            onchange={(v) => patch({ bedWidth: v })}
          />
          <NumberField
            label="Bed height"
            unit="mm"
            value={selected.bedHeight}
            min={10}
            max={3000}
            onchange={(v) => patch({ bedHeight: v })}
          />
          {#if grbl}
            <NumberField
              label="Max S ($30)"
              value={selected.maxS}
              min={1}
              max={100000}
              onchange={(v) => patch({ maxS: v })}
            />
            <NumberField
              label="Baud rate"
              value={selected.baudRate}
              min={1200}
              max={2000000}
              onchange={(v) => patch({ baudRate: v })}
            />
            <NumberField
              label="Jog speed"
              unit="mm/min"
              value={selected.defaultJogSpeed}
              min={1}
              max={60000}
              step={100}
              onchange={(v) => patch({ defaultJogSpeed: v })}
            />
            <NumberField
              label="Frame speed"
              unit="mm/min"
              value={selected.frameSpeed}
              min={1}
              max={60000}
              step={100}
              onchange={(v) => patch({ frameSpeed: v })}
            />
            <NumberField
              label="Frame power"
              unit="%"
              decimals={1}
              value={selected.framePowerPercent}
              min={0}
              max={MAX_FRAME_POWER_PERCENT}
              step={0.5}
              onchange={(v) => patch({ framePowerPercent: v })}
            />
          {/if}
        </div>
        <div class="field">
          Origin (0,0)
          <div class="segmented" role="group" aria-label="Origin corner">
            {#each ORIGINS as o (o.id)}
              <button
                type="button"
                aria-pressed={selected.originCorner === o.id}
                onclick={() => patch({ originCorner: o.id })}>{o.label}</button
              >
            {/each}
          </div>
        </div>
        <div class="toggles">
          {#if grbl}
            <Toggle
              label="Constant power (M3)"
              checked={selected.constantPower}
              onchange={(c) => patch({ constantPower: c })}
            />
            <Toggle
              label="Warn without laser mode ($32)"
              checked={selected.laserModeRequired}
              onchange={(c) => patch({ laserModeRequired: c })}
            />
          {/if}
          <Toggle
            label={grbl ? 'Air assist (M8)' : 'Air assist'}
            checked={selected.supportsAirAssist}
            onchange={(c) => patch({ supportsAirAssist: c })}
          />
        </div>
        {#if grbl}
          <div class="grid">
            <label class="field"
              >G-code header<textarea
                class="input mono area"
                value={selected.gcodeHeader}
                onchange={(e) => patch({ gcodeHeader: e.currentTarget.value })}
              ></textarea></label
            >
            <label class="field"
              >G-code footer<textarea
                class="input mono area"
                value={selected.gcodeFooter}
                onchange={(e) => patch({ gcodeFooter: e.currentTarget.value })}
              ></textarea></label
            >
          </div>
        {/if}
      </div>
    {/key}
  </div>
  {#snippet footer()}
    {#if selected.id !== profiles.activeId}
      <button type="button" class="btn start" onclick={() => profiles.activate(selected.id)}
        >Use this machine</button
      >
    {/if}
    <button type="button" class="btn" onclick={() => (ui.profilesOpen = false)}>Done</button>
  {/snippet}
</Dialog>

<style>
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
  }

  .layout {
    display: flex;
    gap: 20px;
    min-height: 380px;
  }

  .list {
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow: auto;
  }

  .item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: var(--ol-radius-md);
    border: 1px solid transparent;
    background: none;
    text-align: left;
    position: relative;
  }

  .item :global(svg) {
    position: absolute;
    right: 10px;
    top: 12px;
    color: var(--ol-go);
  }

  .item.on {
    background: var(--ol-surface-2);
    border-color: var(--ol-border-strong);
  }

  .name {
    font-weight: 500;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  :global(.preset-pop) {
    width: 320px;
  }

  .list-actions {
    display: flex;
    gap: 2px;
  }

  .editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .toggles {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .area {
    height: 64px;
    padding: 8px 10px;
    resize: vertical;
    font-size: var(--ol-fs-sm);
  }
</style>
