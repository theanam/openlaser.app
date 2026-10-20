<script lang="ts">
  import Bug from '@lucide/svelte/icons/bug';
  import Mail from '@lucide/svelte/icons/mail';
  import Plug from '@lucide/svelte/icons/plug';
  import Download from '@lucide/svelte/icons/download';
  import Layers from '@lucide/svelte/icons/layers';
  import PenTool from '@lucide/svelte/icons/pen-tool';
  import Image from '@lucide/svelte/icons/image';
  import Play from '@lucide/svelte/icons/play';
  import Scan from '@lucide/svelte/icons/scan';
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import Save from '@lucide/svelte/icons/save';
  import Wrench from '@lucide/svelte/icons/wrench';
  import Compass from '@lucide/svelte/icons/compass';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import type { Component } from 'svelte';
  import { CONTACT_EMAIL, ISSUES_URL } from '$lib/config/app';
  import { formatCombo } from '../lib/keys';
  import { LISTED_SHORTCUTS } from '../shortcuts';
  import { route } from '../state/route.svelte';
  import { ui } from '../state/ui.svelte';
  import PageShell from './PageShell.svelte';
  import ConnectTroubleshooter from '../connect/ConnectTroubleshooter.svelte';
  import Unplug from '@lucide/svelte/icons/unplug';

  const topics: Array<{ icon: Component; title: string; items: string[] }> = [
    {
      icon: Plug,
      title: 'Connect',
      items: [
        'Use Chrome, Edge, Opera or Brave on a desktop. Machine control needs Web Serial.',
        'Connect laser, then pick the USB port. Most GRBL lasers use 115200 baud.',
        'Try the virtual machine to practise without hardware.',
      ],
    },
    {
      icon: Download,
      title: 'Import',
      items: [
        'Drop SVG, DXF, PNG, JPEG, WebP, AVIF, BMP or GIF files onto the app, or use the Image tool in the tool rail.',
        'SVG sizes come from width, height and viewBox. Files from tools that export at 72 ppi can be adjusted in the import dialog.',
        'Convert text to paths in your editor before exporting SVG.',
        'DXF imports lines, polylines, arcs, circles, ellipses, splines and blocks. Units come from the file and can be changed in the import dialog. Explode text and hatches to outlines in your CAD tool first.',
        'Open (⌘O) takes .olaser projects and G-code files (.gcode, .nc, .ngc), which run as they are.',
      ],
    },
    {
      icon: PenTool,
      title: 'Text and outlines',
      items: [
        'The font picker lists every Google Font, plus Uploaded and System tabs. Upload TTF, OTF or WOFF files; they stay in this browser.',
        'System fonts need Chrome or Edge: open the System tab and allow font access once.',
        'Text keeps its outlines in the project, so it burns the same on a computer without the font.',
        'Outline (O) draws one cut line around everything selected. A logo and a key-ring hole selected together get a single outline around both.',
      ],
    },
    {
      icon: Layers,
      title: 'Layers',
      items: [
        'Line follows paths: cuts and scores. Kerf offset grows outlines and shrinks holes.',
        'Fill engraves the inside of closed shapes with scanlines at any angle.',
        'Layers run top to bottom. Drag rows to reorder. The bolt toggles output, the eye toggles visibility.',
        'Drag any field label left or right to scrub its value. Fields accept math like 100/3.',
      ],
    },
    {
      icon: Image,
      title: 'Photos',
      items: [
        'Images go on an Image layer. Pick a dithering mode and watch the bed preview update.',
        'Line density sets dots per inch. 254 dpi is 0.1 mm per line, a good start for diode lasers.',
        'Grayscale maps brightness to power between Min power and Power.',
        'Rotated images are not supported yet. Keep image rotation at 0°.',
      ],
    },
    {
      icon: Play,
      title: 'Preview and export',
      items: [
        'Preview shows burns shaded by power and travel moves dashed. Press play or drag the slider.',
        'The time is an estimate based on your machine’s acceleration settings.',
        'Export G-code saves a file for SD cards or other senders.',
      ],
    },
    {
      icon: Scan,
      title: 'Run a job',
      items: [
        'Frame traces the job outline with the laser off. Turn on frame power in Machine profiles if you want a faint dot.',
        'Start job checks the machine is idle and asks you to confirm safety on the first run.',
        'Stop, or Esc, halts the laser at once. Pause holds motion and Resume continues.',
        'Overrides change speed and power live while a job runs.',
      ],
    },
    {
      icon: Crosshair,
      title: 'Machine',
      items: [
        'Jog with the pad or arrow buttons. Home runs $H when homing is enabled.',
        'An alarm shows what happened and what to do. Unlock ($X) clears it once the cause is fixed.',
        'The console shows every line sent and received. Download the log when reporting a hardware bug.',
        'Device settings lists $$ values with descriptions and saves a backup file.',
      ],
    },
    {
      icon: Save,
      title: 'Files',
      items: [
        'Projects autosave in this browser and appear under Recent projects.',
        'Save writes a .olaser file with all images inside. Open it on any computer.',
        'Machine profiles export and import as .json files.',
        'Print template prints the design at actual size for test fits and alignment.',
      ],
    },
    {
      icon: Wrench,
      title: 'Troubleshooting',
      items: [
        'Laser stays on between shapes: enable laser mode ($32=1) from the machine panel.',
        'Error 20 or 22: the machine rejected a command. Check the console for the line.',
        'Alarm 1 or 2: a limit was hit. Unlock, home, and check the job fits the bed.',
        'Job looks mirrored: set the origin corner in Machine profiles to match your machine.',
      ],
    },
  ];
</script>

<PageShell title="Help">
  <div class="contact">
    <a class="card" href={ISSUES_URL} target="_blank" rel="noopener">
      <Bug size={20} />
      <span><strong>Report a problem</strong><span class="muted">Open an issue on GitHub</span></span>
    </a>
    <a class="card" href="mailto:{CONTACT_EMAIL}">
      <Mail size={20} />
      <span><strong>Everything else</strong><span class="muted">{CONTACT_EMAIL}</span></span>
    </a>
    <button
      type="button"
      class="card"
      onclick={() => {
        route.go('app');
        ui.tourOpen = true;
      }}
    >
      <Compass size={20} />
      <span><strong>Take the tour</strong><span class="muted">A visual walk through every feature</span></span
      >
    </button>
  </div>

  {#each topics as topic (topic.title)}
    <section>
      <h2><topic.icon size={18} />{topic.title}</h2>
      <ul>
        {#each topic.items as item (item)}<li>{item}</li>{/each}
      </ul>
    </section>
  {/each}

  <section id="machine-not-showing-up" data-testid="help-connect">
    <h2><Unplug size={18} />Machine not showing up</h2>
    <ConnectTroubleshooter />
  </section>

  <section>
    <h2><Keyboard size={18} />Keyboard shortcuts</h2>
    <dl class="keys">
      {#each LISTED_SHORTCUTS as s (s.label)}
        <div>
          <dt>{s.label}</dt>
          <dd>
            {#each s.keys as k (k)}<kbd class="kbd">{formatCombo(k)}</kbd>{/each}
          </dd>
        </div>
      {/each}
    </dl>
  </section>
</PageShell>

<style>
  .contact {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 36px;
  }

  .card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 16px;
    border-radius: var(--ol-radius-lg);
    border: 1px solid var(--ol-border);
    background: var(--ol-surface);
    color: var(--ol-text);
    text-decoration: none;
    text-align: left;
    font: inherit;
  }

  .card:hover {
    border-color: var(--ol-border-strong);
  }

  .card :global(svg) {
    color: var(--ol-signal);
    flex-shrink: 0;
  }

  .card span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  section {
    margin-bottom: 28px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--ol-fs-xl);
    font-weight: 600;
    margin-bottom: 10px;
  }

  h2 :global(svg) {
    color: var(--ol-text-muted);
  }

  ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--ol-text-2);
    line-height: 1.55;
    font-size: 14px;
  }

  .keys {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 4px 24px;
    margin: 0;
  }

  .keys div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    border-bottom: 1px solid var(--ol-border);
  }

  dd {
    margin: 0;
    display: flex;
    gap: 4px;
  }
</style>
