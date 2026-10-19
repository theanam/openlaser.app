<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import type { Snippet } from 'svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import GithubMark from '$lib/ui/GithubMark.svelte';
  import { REPO_URL } from '$lib/config/app';
  import { route } from '../state/route.svelte';
  import { machine } from '../state/machine.svelte';
  import StopButton from '../machine/StopButton.svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="page" data-testid="page-{title.toLowerCase()}">
  <header>
    <button type="button" class="btn ghost" onclick={() => route.go('app')}
      ><ArrowLeft size={16} />Back</button
    >
    <Logo size={28} />
    <span class="spacer"></span>
    <a
      class="icon-btn"
      href={REPO_URL}
      target="_blank"
      rel="noopener"
      aria-label="openlaser on GitHub"
      title="GitHub"><GithubMark /></a
    >
  </header>
  {#if machine.connected}
    <!-- Stop stays reachable on every screen while a machine is connected. -->
    <div class="stop-strip"><StopButton /></div>
  {/if}
  <main>
    <h1>{title}</h1>
    {@render children()}
  </main>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    z-index: 30;
    overflow: auto;
    background: var(--ol-bg);
    color: var(--ol-text);
  }

  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    height: var(--ol-topbar-h);
    padding: 0 16px;
    background: var(--ol-surface);
    border-bottom: 1px solid var(--ol-border);
    z-index: 1;
  }

  .spacer {
    flex: 1;
  }

  .stop-strip {
    position: sticky;
    top: var(--ol-topbar-h);
    padding: 8px 16px;
    background: var(--ol-surface);
    border-bottom: 1px solid var(--ol-border);
    z-index: 1;
  }

  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 40px 24px 80px;
  }

  h1 {
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.05em;
    margin-bottom: 28px;
  }
</style>
