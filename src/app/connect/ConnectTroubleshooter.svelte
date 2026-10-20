<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Cpu from '@lucide/svelte/icons/cpu';
  import { ISSUES_URL } from '$lib/config/app';
  import { toast } from '$lib/ui/toasts.svelte';
  import { detectPlatform, type DesktopPlatform } from '../lib/platform';
  import ConnectArt, { type ConnectStep } from './ConnectArt.svelte';
  import {
    BLUETOOTH,
    DRIVERS,
    LAST_CHECKS,
    PLATFORM_LABELS,
    POWER,
    USB,
    type HelpLine,
  } from './connect-help';

  /** Step-by-step help for a laser missing from the port list. `onvirtual` offers the simulator. */
  let { onvirtual }: { onvirtual?: () => void } = $props();

  let platform = $state<DesktopPlatform>(detectPlatform());
  let link = $state<'usb' | 'bluetooth'>('usb');
  const PLATFORMS = Object.keys(PLATFORM_LABELS) as DesktopPlatform[];

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied');
    } catch {
      toast.warning('Copy failed. Select the command and copy it by hand.');
    }
  }
</script>

{#snippet lines(items: HelpLine[])}
  <ul class="lines">
    {#each items as line (line.text)}
      <li>
        <span>{line.text}</span>
        {#if line.code}
          <span class="code">
            <code>{line.code}</code>
            <button
              type="button"
              class="icon-btn sm"
              aria-label="Copy command"
              onclick={() => void copy(line.code!)}><Copy size={13} /></button
            >
          </span>
        {/if}
        {#if line.links}
          <span class="links">
            {#each line.links as l (l.href)}
              <a href={l.href} target="_blank" rel="noopener noreferrer"
                >{l.label}<ExternalLink size={12} /></a
              >
            {/each}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet step(n: number, art: ConnectStep, title: string)}
  <div class="step-head">
    <ConnectArt step={art} />
    <h3><span class="num">{n}</span>{title}</h3>
  </div>
{/snippet}

<ol class="steps" data-testid="connect-help">
  <li>
    {@render step(1, 'power', 'Power on the laser')}
    {@render lines(POWER)}
  </li>
  <li>
    {@render step(2, 'cable', 'Connect it')}
    <div class="segmented tabs" role="group" aria-label="Connection">
      <button type="button" aria-pressed={link === 'usb'} onclick={() => (link = 'usb')}>USB</button>
      <button type="button" aria-pressed={link === 'bluetooth'} onclick={() => (link = 'bluetooth')}
        >Bluetooth</button
      >
    </div>
    {@render lines(link === 'usb' ? USB : BLUETOOTH)}
  </li>
  <li>
    {@render step(3, 'driver', 'Install the USB driver')}
    <p class="lead">Most lasers use a CH340 or CP210x USB chip.</p>
    <div class="segmented tabs" role="group" aria-label="Your computer" data-testid="connect-platform">
      {#each PLATFORMS as p (p)}
        <button type="button" aria-pressed={platform === p} onclick={() => (platform = p)}
          >{PLATFORM_LABELS[p]}</button
        >
      {/each}
    </div>
    {@render lines(DRIVERS[platform])}
  </li>
  <li>
    {@render step(4, 'checks', 'Still missing?')}
    {@render lines(LAST_CHECKS)}
    <p class="foot">
      {#if onvirtual}
        <button type="button" class="btn small" onclick={onvirtual}
          ><Cpu size={14} />Try the virtual machine</button
        >
      {/if}
      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer"
        >Report it on GitHub<ExternalLink size={12} /></a
      >
    </p>
  </li>
</ol>

<style>
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .steps > li {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Step content lines up under the title, beside the illustration. */
  .steps > li > :not(.step-head) {
    margin-left: 84px;
  }

  @media (max-width: 560px) {
    .steps > li > :not(.step-head) {
      margin-left: 0;
    }
  }

  .step-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: var(--ol-fs-lg);
    font-weight: 600;
  }

  .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--ol-beam);
    color: var(--ol-bg);
    font-size: var(--ol-fs-sm);
  }

  .lead {
    margin: 0;
    color: var(--ol-text-2);
  }

  .tabs {
    align-self: flex-start;
  }

  .lines {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    line-height: 1.5;
    color: var(--ol-text-2);
  }

  .lines li {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .code {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    max-width: 100%;
    padding: 2px 2px 2px 10px;
    border-radius: var(--ol-radius-sm);
    background: var(--ol-surface-2);
    border: 1px solid var(--ol-border);
  }

  code {
    font-family: var(--ol-font-mono);
    font-size: var(--ol-fs-sm);
    overflow-x: auto;
    white-space: nowrap;
  }

  .links,
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin: 0;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ol-beam);
    font-weight: 500;
  }
</style>
