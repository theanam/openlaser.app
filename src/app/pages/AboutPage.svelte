<script lang="ts">
  import Bug from '@lucide/svelte/icons/bug';
  import Mail from '@lucide/svelte/icons/mail';
  import Logo from '$lib/ui/Logo.svelte';
  import GithubMark from '$lib/ui/GithubMark.svelte';
  import { APP_TAGLINE, APP_VERSION, CONTACT_EMAIL, ISSUES_URL, REPO_URL } from '$lib/config/app';
  import PageShell from './PageShell.svelte';

  const credits = [
    { name: 'Svelte', license: 'MIT', url: 'https://svelte.dev' },
    { name: 'Geist and Geist Mono', license: 'OFL-1.1', url: 'https://vercel.com/font' },
    { name: 'Lucide icons', license: 'ISC', url: 'https://lucide.dev' },
    { name: 'Bits UI', license: 'MIT', url: 'https://bits-ui.com' },
    { name: 'Clipper2 (clipper2-ts)', license: 'BSL-1.0', url: 'https://github.com/countertype/clipper2-ts' },
    { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
    { name: 'idb', license: 'ISC', url: 'https://github.com/jakearchibald/idb' },
    { name: 'Ruida job format (from MeerK40t)', license: 'MIT', url: 'https://github.com/meerk40t/meerk40t' },
    { name: 'GRBL error and alarm text', license: 'GPL-3.0 docs', url: 'https://github.com/gnea/grbl' },
  ];
</script>

<PageShell title="About">
  <div class="hero">
    <Logo size={56} fontSize={40} domain />
    <p class="tagline">{APP_TAGLINE}</p>
    <p class="mono muted">Version {APP_VERSION} · MIT license</p>
  </div>

  <div class="links">
    <a class="btn" href={REPO_URL} target="_blank" rel="noopener"><GithubMark size={16} />Source code</a>
    <a class="btn" href={ISSUES_URL} target="_blank" rel="noopener"><Bug size={16} />Report an issue</a>
    <a class="btn" href="mailto:{CONTACT_EMAIL}"><Mail size={16} />{CONTACT_EMAIL}</a>
  </div>

  <section>
    <h2>How it works</h2>
    <p>
      openlaser runs entirely in your browser. Designs, toolpaths and G-code are computed on your computer,
      and the app talks to your laser over Web Serial. Projects stay in your browser storage and in the files
      you save.
    </p>
  </section>

  <section>
    <h2>Built with</h2>
    <ul class="credits">
      {#each credits as c (c.name)}
        <li>
          <a href={c.url} target="_blank" rel="noopener">{c.name}</a><span class="mono dim">{c.license}</span>
        </li>
      {/each}
    </ul>
  </section>
</PageShell>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 24px;
  }

  .tagline {
    font-size: var(--ol-fs-xl);
    color: var(--ol-text-2);
    max-width: 560px;
    line-height: 1.45;
  }

  .links {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 36px;
  }

  .links a {
    text-decoration: none;
  }

  section {
    margin-bottom: 28px;
  }

  h2 {
    font-size: var(--ol-fs-xl);
    font-weight: 600;
    margin-bottom: 10px;
  }

  p {
    line-height: 1.6;
    color: var(--ol-text-2);
    font-size: 14px;
  }

  .credits {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .credits li {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--ol-border);
  }
</style>
