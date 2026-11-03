<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { toast } from '$lib/ui/toasts.svelte';
  import SetupArt from './SetupArt.svelte';
  import type { SetupStep } from './setup-guide';

  /** Numbered steps, each with a picture of what to look for and anything to copy. */
  let { steps, scheme }: { steps: SetupStep[]; scheme: string } = $props();

  let copied = $state<string | null>(null);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      copied = code;
      toast.success('Copied');
    } catch {
      toast.warning('Copy failed. Select the text and copy it by hand.');
    }
  }
</script>

<ol class="steps" data-testid="setup-steps">
  {#each steps as step, i (step.title)}
    <li>
      <SetupArt art={step.art} {scheme} />
      <div class="body">
        <h3><span class="num">{i + 1}</span>{step.title}</h3>
        {#if step.detail}<p>{step.detail}</p>{/if}
        {#if step.code}
          <div class="code">
            <code>{step.code}</code>
            <button
              type="button"
              class="btn small signal"
              onclick={() => void copy(step.code!)}
              data-testid="setup-copy"
              >{#if copied === step.code}<Check size={14} />Copied{:else}<Copy size={14} />Copy{/if}</button
            >
          </div>
        {/if}
        {#if step.links}
          <span class="links">
            {#each step.links as l (l.href)}
              <a
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer">{l.label}<ExternalLink size={12} /></a
              >
            {/each}
          </span>
        {/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  li {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
    padding-top: 4px;
  }

  @media (max-width: 480px) {
    li {
      flex-direction: column;
    }
  }

  h3 {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
    line-height: 1.35;
  }

  .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--ol-beam);
    color: var(--ol-bg);
    font-size: var(--ol-fs-sm);
  }

  p {
    margin: 0 0 0 30px;
    color: var(--ol-text-2);
    line-height: 1.5;
  }

  .code,
  .links {
    margin-left: 30px;
  }

  .code {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
    border-radius: var(--ol-radius-sm);
    background: var(--ol-surface-2);
    border: 1px solid var(--ol-border);
  }

  code {
    flex: 1;
    min-width: 0;
    font-family: var(--ol-font-mono);
    font-size: var(--ol-fs-sm);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ol-beam);
    font-weight: 500;
  }
</style>
