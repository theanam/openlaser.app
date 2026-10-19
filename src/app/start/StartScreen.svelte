<script lang="ts">
  import Plug from '@lucide/svelte/icons/plug';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Plus from '@lucide/svelte/icons/plus';
  import Download from '@lucide/svelte/icons/download';
  import FileCode from '@lucide/svelte/icons/file-code';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Info from '@lucide/svelte/icons/info';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Logo from '$lib/ui/Logo.svelte';
  import SafetyStrip from './SafetyStrip.svelte';
  import GithubMark from '$lib/ui/GithubMark.svelte';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import { REPO_URL } from '$lib/config/app';
  import { isWebSerialSupported } from '$lib/machine';
  import { relativeTime } from '../lib/format';
  import { preferences } from '../state/preferences.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { route } from '../state/route.svelte';
  import { session } from '../state/session.svelte';
  import { ui } from '../state/ui.svelte';
  import * as actions from '../actions';

  const serial = isWebSerialSupported();
  const theme = $derived(preferences.value.theme === 'dark' ? 'dark' : 'light');
  const profile = $derived(profiles.active);
  const ORIGINS = { bl: 'Bottom left', tl: 'Top left', tr: 'Top right', br: 'Bottom right' } as const;

  function toggleTheme() {
    void preferences.update({ theme: theme === 'dark' ? 'light' : 'dark' });
  }
</script>

<div class="start" data-theme={theme} data-testid="start-screen">
  <header class="top">
    <Logo size={32} fontSize={19} domain />
    <nav aria-label="Main">
      <button type="button" class="icon-btn" aria-label="Help" title="Help" onclick={() => route.go('help')}
        ><CircleHelp size={18} /></button
      >
      <button
        type="button"
        class="icon-btn"
        aria-label="About"
        title="About"
        onclick={() => route.go('about')}><Info size={18} /></button
      >
      <a
        class="icon-btn"
        href={REPO_URL}
        target="_blank"
        rel="noopener"
        aria-label="Source code on GitHub"
        title="GitHub"><GithubMark /></a
      >
      <button
        type="button"
        class="icon-btn framed"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onclick={toggleTheme}
      >
        {#if theme === 'dark'}<Sun size={18} />{:else}<Moon size={18} />{/if}
      </button>
    </nav>
  </header>

  <main class="main">
    <section class="lead">
      <div class="hero">
        <span class="serial-pill" class:missing={!serial} data-testid="serial-pill">
          <span class="dot"></span>{serial ? 'Web Serial available' : 'Machine control needs Chrome or Edge'}
        </span>
        <h1>Your laser,<br />one tab away.</h1>
        <p>
          Import art, set your layers, frame the job and burn, straight from Chrome or Edge. No install, no
          account, works offline.
        </p>
      </div>

      <div class="ctas">
        <button
          type="button"
          class="btn signal big"
          disabled={!serial}
          onclick={() => actions.startWithMachine('webserial')}
        >
          <Plug size={18} />Connect laser
        </button>
        <button
          type="button"
          class="btn big secondary"
          onclick={() => actions.startWithMachine('simulator')}
          data-testid="try-virtual"
        >
          <Cpu size={18} />Try the virtual machine
        </button>
      </div>

      <div class="cards">
        <button type="button" class="card" onclick={() => actions.newProject()} data-testid="new-project">
          <Plus size={20} /><span class="card-title">New project</span><span class="card-sub"
            >Blank bed from your profile</span
          >
        </button>
        <button type="button" class="card" onclick={() => actions.importArt()}>
          <Download size={20} /><span class="card-title">Import art</span><span class="card-sub"
            >SVG, DXF, PNG, JPEG, WebP</span
          >
        </button>
        <button type="button" class="card" onclick={() => actions.openGcodeFile()}>
          <FileCode size={20} /><span class="card-title">Send G-code</span><span class="card-sub"
            >.gcode, .nc, .ngc files</span
          >
        </button>
      </div>

      <SafetyStrip />
    </section>

    <aside class="side">
      <ErrorBoundary name="Recent projects">
        <div class="panel recents">
          <div class="panel-head">
            <h2>Recent projects</h2>
            <button type="button" class="link" onclick={() => actions.openFile()}
              ><FolderOpen size={14} />Open file…</button
            >
          </div>
          {#if session.recents.length === 0}
            <p class="empty">Projects you open or create show up here.</p>
          {:else}
            <ul>
              {#each session.recents.slice(0, 6) as recent (recent.id)}
                <li class="recent">
                  <button type="button" class="recent-open" onclick={() => actions.openRecent(recent.id)}>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Thumbnail SVG built by thumbnail.ts with escaped values. -->
                    <span class="thumb">{@html recent.thumbnail}</span>
                    <span class="recent-text">
                      <span class="recent-name">{recent.name}</span>
                      <span class="recent-meta"
                        >{recent.layerCount}
                        {recent.layerCount === 1 ? 'layer' : 'layers'} · edited {relativeTime(
                          recent.updatedAt,
                        )}</span
                      >
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    class="icon-btn sm forget"
                    aria-label="Remove {recent.name} from recent projects"
                    onclick={() => session.forget(recent.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </ErrorBoundary>

      <div class="panel machine" data-theme="dark">
        <div class="panel-head">
          <h2>Machine profile</h2>
          <button type="button" class="btn small ghost" onclick={() => (ui.profilesOpen = true)}
            >Change</button
          >
        </div>
        <dl class="specs">
          <div>
            <dt>Model</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt>Bed</dt>
            <dd class="mono">{profile.bedWidth} × {profile.bedHeight} mm</dd>
          </div>
          <div>
            <dt>Firmware</dt>
            <dd class="mono">GRBL 1.1</dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>{ORIGINS[profile.originCorner]}</dd>
          </div>
        </dl>
        <div class="rule"></div>
        <p class="tip">
          Laser not showing up? Install the CH340 or CP210x driver, and on Linux add yourself to the <span
            class="mono accent">dialout</span
          > group.
        </p>
      </div>
    </aside>
  </main>

  <footer class="foot">
    <span>Free and open source · Runs on Chrome, Edge, Opera and Brave</span>
    <span class="foot-links">
      <button type="button" class="link" onclick={() => route.go('help')}>Help</button>
      <button type="button" class="link" onclick={() => route.go('about')}>About</button>
      <button type="button" class="link" onclick={() => (ui.tourOpen = true)}>Tour</button>
      <span class="mono">Offline ready</span>
    </span>
  </footer>
</div>

<style>
  .start {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--ol-bg);
    color: var(--ol-text);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px clamp(16px, 4vw, 48px);
  }

  nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn.framed {
    width: 40px;
    height: 40px;
    border: 1px solid var(--ol-border);
    background: var(--ol-surface);
    border-radius: var(--ol-radius-md);
  }

  .main {
    flex-grow: 1;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px clamp(16px, 4vw, 48px) 48px;
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: flex-start;
  }

  .lead {
    flex: 999 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 24px;
  }

  .serial-pill {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--ol-surface);
    border: 1px solid var(--ol-border);
    font: 500 var(--ol-fs-sm) var(--ol-font-mono);
    color: var(--ol-text-2);
  }

  .serial-pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ol-go);
  }

  .serial-pill.missing {
    background: var(--ol-hold-tint);
    border-color: var(--ol-hold);
  }

  .serial-pill.missing .dot {
    background: var(--ol-hold);
  }

  h1 {
    font-size: clamp(44px, 6vw, 76px);
    line-height: 0.98;
    font-weight: 600;
    letter-spacing: -0.05em;
  }

  .hero p {
    font-size: var(--ol-fs-xl);
    line-height: 1.5;
    color: var(--ol-text-muted);
    max-width: 560px;
  }

  .ctas {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn.big {
    height: 52px;
    padding: 0 22px;
    border-radius: 12px;
    font-size: 16px;
  }

  .btn.secondary {
    background: var(--ol-surface);
    border-color: var(--ol-border-strong);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  .card {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    border-radius: var(--ol-radius-lg);
    border: 1px solid var(--ol-border);
    background: var(--ol-surface);
    color: var(--ol-text);
  }

  .card:hover {
    border-color: var(--ol-border-strong);
  }

  .card :global(svg) {
    color: var(--ol-signal);
  }

  .card-title {
    font-size: var(--ol-fs-lg);
    font-weight: 600;
  }

  .card-sub {
    color: var(--ol-text-muted);
  }

  .side {
    flex: 1 1 380px;
    max-width: 460px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .panel {
    border-radius: var(--ol-radius-xl);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--ol-surface);
    border: 1px solid var(--ol-border);
    color: var(--ol-text);
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: var(--ol-fs-lg);
    font-weight: 600;
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    color: var(--ol-signal);
    font-size: var(--ol-fs-md);
  }

  .link:hover {
    text-decoration: underline;
  }

  .empty {
    color: var(--ol-text-muted);
  }

  ul {
    list-style: none;
    margin: 0 -10px;
    padding: 0;
  }

  .recent {
    position: relative;
    display: flex;
    align-items: center;
  }

  .recent-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px;
    border-radius: 12px;
    border: 0;
    background: transparent;
    color: var(--ol-text);
    text-align: left;
  }

  .recent-open:hover {
    background: var(--ol-surface-2);
  }

  .thumb {
    width: 64px;
    height: 64px;
    border-radius: var(--ol-radius-md);
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
  }

  .thumb :global(svg) {
    width: 100%;
    height: 100%;
  }

  .recent-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .recent-name {
    font-size: var(--ol-fs-lg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-meta {
    color: var(--ol-text-muted);
  }

  .forget {
    position: absolute;
    right: 34px;
    opacity: 0;
  }

  .recent:hover .forget,
  .forget:focus-visible {
    opacity: 1;
  }

  .specs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .specs div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  dt {
    color: var(--ol-text-muted);
  }

  dd {
    margin: 0;
    font-weight: 500;
  }

  .rule {
    height: 1px;
    background: var(--ol-border);
  }

  .tip {
    line-height: 1.55;
    color: var(--ol-text-2);
  }

  .accent {
    color: var(--ol-signal-text);
  }

  .foot {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 18px clamp(16px, 4vw, 48px);
    border-top: 1px solid var(--ol-border);
    color: var(--ol-text-muted);
  }

  .foot-links {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .foot .link {
    color: var(--ol-text-muted);
  }
</style>
