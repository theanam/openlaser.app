<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import { formatCombo } from '../lib/keys';
  import { LISTED_SHORTCUTS } from '../shortcuts';
  import { ui } from '../state/ui.svelte';

  const groups = $derived(
    [...new Set(LISTED_SHORTCUTS.map((s) => s.group))].map((group) => ({
      group,
      items: LISTED_SHORTCUTS.filter((s) => s.group === group),
    })),
  );
</script>

<Dialog bind:open={ui.shortcutsOpen} title="Keyboard shortcuts" width={640} testid="shortcuts-dialog">
  <div class="cols">
    {#each groups as g (g.group)}
      <section>
        <h3>{g.group}</h3>
        <dl>
          {#each g.items as s (s.label)}
            <div class="row">
              <dt>{s.label}</dt>
              <dd>
                {#each s.keys as k (k)}<kbd class="kbd">{formatCombo(k)}</kbd>{/each}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Dialog>

<style>
  .cols {
    columns: 2;
    column-gap: 24px;
  }

  section {
    break-inside: avoid;
    margin-bottom: 16px;
  }

  h3 {
    font-size: var(--ol-fs-sm);
    font-weight: 600;
    color: var(--ol-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }

  dl {
    margin: 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
  }

  dd {
    margin: 0;
    display: flex;
    gap: 4px;
  }
</style>
