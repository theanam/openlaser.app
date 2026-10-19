/** Hash routes, so pages work from any static host (GitHub Pages included). */
export type Page = 'app' | 'help' | 'about';

function parse(hash: string): Page {
  const path = hash.replace(/^#\/?/, '');
  return path === 'help' || path === 'about' ? path : 'app';
}

class Route {
  page = $state<Page>(typeof location === 'undefined' ? 'app' : parse(location.hash));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => (this.page = parse(location.hash)));
    }
  }

  go(page: Page): void {
    const hash = page === 'app' ? '' : `#/${page}`;
    if (location.hash !== hash) history.pushState(null, '', hash || location.pathname + location.search);
    this.page = page;
  }
}

export const route = new Route();
