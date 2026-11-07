<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import { accessories, activeAccessory, objectDiameter } from 'libopenlaser/project';
  import { setJobSettings } from 'libopenlaser/project';
  import type { Id, JobSettings } from 'libopenlaser/project';
  import { editor } from '../state/editor.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { connectedSession } from '../machines/registry';

  /**
   * What is fitted for this job: the flat bed, or one of the machine's accessories. The work area,
   * rotary scaling and the machine's mode switch follow from the choice.
   */
  const list = $derived(accessories(profiles.active));
  const settings = $derived(editor.project?.jobSettings);
  const current = $derived(activeAccessory(profiles.active, settings));
  const diameter = $derived(objectDiameter(settings));
  const busy = $derived(connectedSession()?.jobActive ?? false);

  function update(patch: Partial<JobSettings>, live = false, field = 'accessory') {
    editor.commit((p) => setJobSettings(p, patch), { coalesce: `job-${field}` });
    if (!live) editor.sealHistory();
  }

  /**
   * LaserPecker's names, shortened for a one-line switch: "Rotary Extension" reads as "Rotary",
   * "Electric Roller" as "Roller". The full name is in the title.
   */
  const shortName = (label: string) =>
    label.replace(/\s+extension$/i, '').replace(/^electric\s+/i, '') || label;

  function pick(id: Id | null) {
    update({ accessoryId: id });
  }
</script>

{#if editor.project && list.length}
  <div class="setup" data-testid="accessory-picker">
    <h3>Setup</h3>
    <div class="segmented setup-options" role="group" aria-label="Setup">
      <button type="button" aria-pressed={!current} disabled={busy} onclick={() => pick(null)}
        >Flat bed</button
      >
      {#each list as accessory (accessory.id)}
        <button
          type="button"
          aria-pressed={current?.id === accessory.id}
          disabled={busy}
          title="{accessory.label}: {accessory.bedWidth} × {accessory.bedHeight} mm"
          onclick={() => pick(accessory.id)}
          data-testid="accessory-{accessory.id}">{shortName(accessory.label)}</button
        >
      {/each}
    </div>
    {#if current?.kind === 'rotary'}
      <div class="rotary">
        <NumberField
          label="Diameter"
          hint="Across the object where it burns. One turn is the height of the work area"
          unit="mm"
          min={1}
          max={1000}
          step={1}
          decimals={1}
          value={diameter}
          disabled={busy}
          onchange={(v, live) => update({ objectDiameter: v }, live, 'diameter')}
          testid="object-diameter"
        />
        <span class="mono muted small" data-testid="object-around"
          >{(Math.PI * diameter).toFixed(1)} mm around</span
        >
      </div>
    {/if}
  </div>
{/if}

<style>
  /* One line per option, whatever the names: long ones end in an ellipsis, the title has them. */
  .setup-options button {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .setup {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-sm);
    font-weight: 600;
    color: var(--ol-text-2);
  }

  .rotary {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .small {
    font-size: var(--ol-fs-xs);
    padding-bottom: 8px;
  }
</style>
