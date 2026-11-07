<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { makeId } from 'libopenlaser/project';
  import type {
    AccessoryKind,
    LaserSource,
    MachineAccessory,
    MachineProfile,
    RotarySetup,
  } from 'libopenlaser/project';

  /**
   * The lasers a machine has and the accessories it can wear, as part of its profile, so jobs
   * switch lasers and modes on their own.
   */
  let {
    profile,
    gcode,
    patch,
  }: { profile: MachineProfile; gcode: boolean; patch: (change: Partial<MachineProfile>) => void } = $props();

  const sources = $derived(profile.laserSources ?? []);
  const fitted = $derived(profile.accessories ?? []);

  function setSource(id: string, change: Partial<LaserSource>) {
    patch({ laserSources: sources.map((s) => (s.id === id ? { ...s, ...change } : s)) });
  }

  function addSource() {
    const next: LaserSource = {
      id: makeId(),
      label: sources.length ? `Laser ${sources.length + 1}` : '450 nm diode',
      wavelength: sources.length ? 1064 : 450,
      selectGcode: '',
      deviceCode: sources.length,
    };
    patch({ laserSources: [...sources, next] });
  }

  function setAccessory(id: string, change: Partial<MachineAccessory>) {
    patch({ accessories: fitted.map((a) => (a.id === id ? { ...a, ...change } : a)) });
  }

  function setRotary(accessory: MachineAccessory, change: Partial<RotarySetup>) {
    if (accessory.rotary) setAccessory(accessory.id, { rotary: { ...accessory.rotary, ...change } });
  }

  function addAccessory(kind: AccessoryKind) {
    const next: MachineAccessory = {
      id: makeId(),
      kind,
      label: kind === 'rotary' ? 'Rotary' : 'Slide',
      bedWidth: profile.bedWidth,
      bedHeight: kind === 'rotary' ? 300 : profile.bedHeight * 2,
      startGcode: '',
      ...(kind === 'rotary'
        ? {
            rotary: {
              type: 'roller',
              axis: 'y',
              unitsPerRotation: 360,
              rollerDiameter: 40,
              // Machines on their own protocol take surface mm.
              deviceScales: !gcode,
            },
          }
        : {}),
    };
    patch({ accessories: [...fitted, next] });
  }
</script>

<section class="hardware" data-testid="profile-hardware">
  <div class="head">
    <h3>Lasers</h3>
    <button type="button" class="btn small ghost" onclick={addSource} data-testid="add-laser"
      ><Plus size={14} />Laser</button
    >
  </div>
  {#if sources.length < 2}
    <p class="muted hint">Add two or more and each layer picks one.</p>
  {/if}
  {#each sources as source (source.id)}
    <div class="card" data-testid="laser-row">
      <div class="row">
        <input
          class="input name"
          aria-label="Laser name"
          value={source.label}
          onchange={(e) => setSource(source.id, { label: e.currentTarget.value })}
        />
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Remove {source.label}"
          onclick={() => patch({ laserSources: sources.filter((s) => s.id !== source.id) })}
          ><Trash2 size={14} /></button
        >
      </div>
      <div class="row">
        <NumberField
          label="Wavelength"
          unit="nm"
          compact
          min={200}
          max={20000}
          value={source.wavelength}
          onchange={(v) => setSource(source.id, { wavelength: v })}
        />
        {#if gcode}
          <input
            class="input mono name"
            aria-label="Select G-code"
            title="G-code that switches to this laser, e.g. M3011"
            placeholder="M3011"
            value={source.selectGcode}
            onchange={(e) => setSource(source.id, { selectGcode: e.currentTarget.value })}
          />
        {:else}
          <NumberField
            label="Code"
            hint="The machine's own number for this laser (LaserPecker: 0 blue, 1 infrared)"
            compact
            min={0}
            max={255}
            value={source.deviceCode}
            onchange={(v) => setSource(source.id, { deviceCode: v })}
          />
        {/if}
      </div>
    </div>
  {/each}

  <div class="head">
    <h3>Accessories</h3>
    <div class="adds">
      <button
        type="button"
        class="btn small ghost"
        onclick={() => addAccessory('rotary')}
        data-testid="add-rotary"><Plus size={14} />Rotary</button
      >
      <button type="button" class="btn small ghost" onclick={() => addAccessory('slide')}
        ><Plus size={14} />Slide</button
      >
    </div>
  </div>
  {#if gcode}
    <label class="field"
      >Flat-bed G-code<input
        class="input mono"
        title="Sent at the start of every job on the flat bed, e.g. a mode switch"
        placeholder="M3030"
        value={profile.flatModeGcode ?? ''}
        onchange={(e) => patch({ flatModeGcode: e.currentTarget.value })}
      /></label
    >
  {/if}
  {#each fitted as accessory (accessory.id)}
    <div class="card" data-testid="accessory-row">
      <div class="row">
        <input
          class="input name"
          aria-label="Accessory name"
          value={accessory.label}
          onchange={(e) => setAccessory(accessory.id, { label: e.currentTarget.value })}
        />
        <button
          type="button"
          class="icon-btn sm"
          aria-label="Remove {accessory.label}"
          onclick={() => patch({ accessories: fitted.filter((a) => a.id !== accessory.id) })}
          ><Trash2 size={14} /></button
        >
      </div>
      <div class="row">
        <NumberField
          label="W"
          hint="Work area width with this accessory fitted"
          unit="mm"
          compact
          min={1}
          max={3000}
          value={accessory.bedWidth}
          onchange={(v) => setAccessory(accessory.id, { bedWidth: v })}
        />
        <NumberField
          label={accessory.kind === 'rotary' ? 'Max around' : 'H'}
          hint={accessory.kind === 'rotary'
            ? 'The most surface the rotary turns through'
            : 'Work area height with this accessory fitted'}
          unit="mm"
          compact
          min={1}
          max={5000}
          value={accessory.bedHeight}
          onchange={(v) => setAccessory(accessory.id, { bedHeight: v })}
        />
      </div>
      {#if gcode}
        <input
          class="input mono"
          aria-label="Start G-code"
          title="Sent at the start of every job with this accessory, e.g. a mode switch"
          placeholder="M3032"
          value={accessory.startGcode}
          onchange={(e) => setAccessory(accessory.id, { startGcode: e.currentTarget.value })}
        />
      {/if}
      {#if accessory.rotary}
        {@const r = accessory.rotary}
        <div class="row">
          <div class="segmented" role="group" aria-label="Rotary type">
            <button
              type="button"
              aria-pressed={r.type === 'roller'}
              onclick={() => setRotary(accessory, { type: 'roller' })}>Roller</button
            >
            <button
              type="button"
              aria-pressed={r.type === 'chuck'}
              onclick={() => setRotary(accessory, { type: 'chuck' })}>Chuck</button
            >
          </div>
          {#if gcode}
            <div class="segmented" role="group" aria-label="Rotary axis">
              <button
                type="button"
                aria-pressed={r.axis === 'y'}
                onclick={() => setRotary(accessory, { axis: 'y' })}>Y</button
              >
              <button
                type="button"
                aria-pressed={r.axis === 'a'}
                onclick={() => setRotary(accessory, { axis: 'a' })}>A</button
              >
            </div>
          {/if}
        </div>
        <Toggle
          label="Machine scales"
          hint="The machine turns surface mm into rotation itself, so positions go out as drawn"
          checked={r.deviceScales}
          onchange={(c) => setRotary(accessory, { deviceScales: c })}
        />
        {#if !r.deviceScales}
          <div class="row">
            <NumberField
              label="Per turn"
              hint="What the controller travels for one full turn of the {r.type}: mm on Y, degrees on A"
              unit={r.axis === 'a' ? '°' : 'mm'}
              compact
              min={0.001}
              max={100000}
              decimals={2}
              value={r.unitsPerRotation}
              onchange={(v) => setRotary(accessory, { unitsPerRotation: v })}
            />
            {#if r.type === 'roller'}
              <NumberField
                label="Roller"
                hint="Diameter of the roller the object rests on"
                unit="mm"
                compact
                min={0.1}
                max={1000}
                decimals={1}
                value={r.rollerDiameter}
                onchange={(v) => setRotary(accessory, { rollerDiameter: v })}
              />
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/each}
</section>

<style>
  .hardware {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-sm);
    font-weight: 600;
  }

  .adds {
    display: flex;
    gap: 4px;
  }

  .hint {
    margin: 0;
    font-size: var(--ol-fs-xs);
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .row .name {
    flex: 1;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--ol-fs-sm);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--ol-border);
    border-radius: var(--ol-radius-md);
  }
</style>
