// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { PathData } from '$lib/geometry/types';
import { importSvg } from '$lib/import/svg';

const svg = (attrs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const points = (path: PathData) =>
  [path.start, ...path.segments.map((s) => s.to)].map((p) => [round(p.x), round(p.y)]);

describe('importSvg: units and placement', () => {
  it('honours mm sizes with a viewBox and flips Y so the drawing is upright', () => {
    const result = importSvg(
      svg(
        'width="100mm" height="50mm" viewBox="0 0 200 100"',
        '<line x1="0" y1="0" x2="20" y2="10" stroke="#f00"/>',
      ),
    );
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    // User unit = 0.5 mm. SVG (0,0) is the top-left → bed (0, 50).
    expect(points(result.groups[0].paths[0])).toEqual([
      [0, 50],
      [10, 45],
    ]);
  });

  it('uses 96 DPI for px and unitless sizes, with an override', () => {
    const doc = svg('width="96" height="192px"', '<rect x="0" y="0" width="96" height="96" fill="#000"/>');
    const at96 = importSvg(doc);
    expect(at96.width).toBeCloseTo(25.4, 9);
    expect(at96.height).toBeCloseTo(50.8, 9);
    const at72 = importSvg(doc, { dpi: 72 });
    expect(at72.width).toBeCloseTo((96 * 25.4) / 72, 9);
    const rect = at72.groups[0].paths[0];
    expect(rect.start.y).toBeCloseTo(at72.height, 9);
  });

  it('supports cm, in and pt sizes', () => {
    expect(
      importSvg(svg('width="2cm" height="1in" viewBox="0 0 10 10" preserveAspectRatio="none"', '')).width,
    ).toBe(20);
    expect(importSvg(svg('width="72pt" height="72pt"', '')).height).toBeCloseTo(25.4, 9);
  });

  it('reads the viewBox as px when no size is given and derives a missing dimension', () => {
    const noSize = importSvg(svg('viewBox="0 0 96 48"', ''));
    expect(noSize.width).toBeCloseTo(25.4, 9);
    expect(noSize.height).toBeCloseTo(12.7, 9);
    const widthOnly = importSvg(svg('width="100mm" viewBox="0 0 200 50"', ''));
    expect(widthOnly.height).toBe(25);
  });

  it('applies the viewBox offset', () => {
    const result = importSvg(
      svg(
        'width="10mm" height="10mm" viewBox="5 5 10 10"',
        '<line x1="5" y1="15" x2="15" y2="15" stroke="black"/>',
      ),
    );
    expect(points(result.groups[0].paths[0])).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it('uses the content extent when the document has no size at all', () => {
    const result = importSvg(svg('', '<line x1="0" y1="0" x2="96" y2="96" stroke="black"/>'));
    expect(result.width).toBeCloseTo(25.4, 9);
    expect(result.height).toBeCloseTo(25.4, 9);
  });

  it('composes nested transforms', () => {
    const body =
      '<g transform="translate(10 0)"><g transform="scale(2)"><line x1="0" y1="0" x2="5" y2="0" stroke="#000" transform="translate(1 2)"/></g></g>';
    const result = importSvg(svg('width="100mm" height="100mm" viewBox="0 0 100 100"', body));
    expect(points(result.groups[0].paths[0])).toEqual([
      [12, 96],
      [22, 96],
    ]);
  });

  it('handles nested svg viewports', () => {
    const body =
      '<svg x="10" y="10" width="20" height="20" viewBox="0 0 2 2"><line x1="0" y1="0" x2="2" y2="0" stroke="#000"/></svg>';
    const result = importSvg(svg('width="100mm" height="100mm" viewBox="0 0 100 100"', body));
    expect(points(result.groups[0].paths[0])).toEqual([
      [10, 90],
      [30, 90],
    ]);
  });

  it('throws a readable error for non-SVG input', () => {
    expect(() => importSvg('<html></html>')).toThrow(/not a valid SVG/);
    expect(() => importSvg('not xml at all <')).toThrow(/not a valid SVG/);
  });
});

describe('importSvg: shapes', () => {
  const doc = (body: string) => importSvg(svg('width="100mm" height="100mm" viewBox="0 0 100 100"', body));

  it('converts every basic shape', () => {
    const result = doc(`
      <rect x="1" y="1" width="10" height="5" stroke="#000" fill="none"/>
      <rect x="1" y="1" width="10" height="6" rx="2" stroke="#000" fill="none"/>
      <circle cx="50" cy="50" r="10" stroke="#000" fill="none"/>
      <ellipse cx="50" cy="50" rx="10" ry="5" stroke="#000" fill="none"/>
      <line x1="0" y1="0" x2="1" y2="1" stroke="#000"/>
      <polyline points="0,0 10,0 10,10" stroke="#000" fill="none"/>
      <polygon points="0,0 10,0 10,10" stroke="#000" fill="none"/>
      <path d="M0 0 L5 5" stroke="#000"/>`);
    const paths = result.groups[0].paths;
    expect(paths).toHaveLength(8);
    expect(paths.map((p) => p.closed)).toEqual([true, true, true, true, false, false, true, false]);
    expect(paths[1].segments.filter((s) => s.type === 'C')).toHaveLength(4);
    expect(paths[2].segments).toHaveLength(4);
    expect(paths[6].segments.at(-1)?.to).toEqual(paths[6].start);
  });

  it('clamps rounded corners and defaults ry to rx', () => {
    const [rect] = doc('<rect width="10" height="4" rx="20" stroke="#000" fill="none"/>').groups[0].paths;
    // rx clamps to 5 and ry to 2: the long sides have no straight part left and are dropped.
    expect(rect.segments.filter((s) => s.type === 'L')).toHaveLength(0);
  });

  it('skips degenerate shapes', () => {
    expect(doc('<rect width="0" height="5" fill="#000"/><circle r="0" fill="#000"/>').groups).toEqual([]);
  });

  it('closes open subpaths of fill-only shapes', () => {
    const [path] = doc('<polyline points="0,0 10,0 10,10" fill="#00f"/>').groups[0].paths;
    expect(path.closed).toBe(true);
    expect(path.segments.at(-1)?.to).toEqual(path.start);
  });
});

describe('importSvg: colors and groups', () => {
  const doc = (body: string, head = '') =>
    importSvg(svg('width="100mm" height="100mm" viewBox="0 0 100 100"', head + body));
  const summary = (body: string, head = '') =>
    doc(body, head).groups.map((g) => `${g.kind}:${g.color}:${g.paths.length}`);

  it('groups by color and kind in order of first appearance', () => {
    expect(
      summary(`
        <path d="M0 0H1" stroke="red"/>
        <rect width="1" height="1" fill="#00F"/>
        <path d="M0 0H2" stroke="#ff0000"/>
        <rect width="1" height="1" fill="blue" stroke="#0f0"/>`),
    ).toEqual(['stroke:#ff0000:2', 'fill:#0000ff:1', 'stroke:#00ff00:1']);
  });

  it('applies the default black fill and inherits fill and stroke from groups', () => {
    expect(
      summary('<rect width="1" height="1"/><g stroke="rgb(0,0,255)" fill="none"><g><circle r="1"/></g></g>'),
    ).toEqual(['fill:#000000:1', 'stroke:#0000ff:1']);
  });

  it('lets the style attribute override presentation attributes', () => {
    expect(summary('<rect width="1" height="1" fill="red" style="fill: #123456; stroke:none"/>')).toEqual([
      'fill:#123456:1',
    ]);
  });

  it('resolves currentColor through inherited color', () => {
    expect(summary('<g color="#abcdef"><path d="M0 0H1" stroke="currentColor" fill="none"/></g>')).toEqual([
      'stroke:#abcdef:1',
    ]);
  });

  it('skips unpainted, hidden and fully transparent shapes', () => {
    expect(
      summary(`
        <rect width="1" height="1" fill="none"/>
        <rect width="1" height="1" fill="red" style="display:none"/>
        <g visibility="hidden"><rect width="1" height="1" fill="red"/></g>
        <rect width="1" height="1" fill="red" fill-opacity="0"/>
        <rect width="1" height="1" fill="red" opacity="0"/>
        <line x1="0" y1="0" x2="1" y2="1" fill="red"/>`),
    ).toEqual([]);
  });

  it('applies class and id rules from style elements by specificity', () => {
    const head = '<style>.a { fill: #111111 } #x { fill: #222222 } rect.a { stroke: #333333 }</style>';
    expect(
      summary(
        '<path class="a" d="M0 0H1V1Z"/><path id="x" class="a" d="M0 0H1V1Z"/><rect class="a" width="1" height="1"/>',
        head,
      ),
    ).toEqual(['fill:#111111:1', 'fill:#222222:1', 'stroke:#333333:1']);
  });

  it('treats gradients as their first stop color and counts them', () => {
    const head = `<defs>
      <linearGradient id="base"><stop offset="0" stop-color="#ff8800"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="ref" xlink:href="#base"/>
      <radialGradient id="styled"><stop offset="0" style="stop-color: rgb(0, 128, 0)"/></radialGradient>
    </defs>`;
    const result = doc(
      '<rect width="1" height="1" fill="url(#ref)"/><circle r="1" fill="url(\'#styled\')"/>',
      head,
    );
    expect(result.groups.map((g) => g.color)).toEqual(['#ff8800', '#008000']);
    expect(result.ignored.gradient).toBe(2);
  });

  it('summarizes ignored elements with hints', () => {
    const result = doc(`
      <text x="0" y="0">Hello</text><text>World</text>
      <use href="#a"/>
      <rect width="1" height="1" fill="red" clip-path="url(#c)" mask="url(#m)" filter="url(#f)"/>
      <image href="photo.png" width="10" height="10"/>`);
    expect(result.ignored).toEqual({ text: 2, use: 1, clipPath: 1, mask: 1, filter: 1, image: 1 });
    expect(result.warnings.find((w) => w.startsWith('2 × text'))).toMatch(
      /convert text to paths in your editor/,
    );
    expect(result.groups).toHaveLength(1);
  });
});

describe('importSvg: embedded images', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';

  it('places data-URI images in mm with a Y-up transform', () => {
    const result = importSvg(
      svg(
        'width="100mm" height="100mm" viewBox="0 0 100 100"',
        `<image x="10" y="20" width="30" height="40" href="${PNG}"/>`,
      ),
    );
    expect(result.images).toHaveLength(1);
    const image = result.images[0];
    expect(image.href).toBe(PNG);
    expect([image.x, image.y, image.width, image.height].map(round)).toEqual([10, 40, 30, 40]);
    expect(image.transform.map(round)).toEqual([1, 0, 0, 1, 10, 40]);
  });

  it('reads xlink:href and scales with the viewBox', () => {
    const result = importSvg(
      svg(
        'width="50mm" height="50mm" viewBox="0 0 100 100"',
        `<image width="100" height="100" xlink:href="${PNG}"/>`,
      ),
    );
    expect([result.images[0].width, result.images[0].height]).toEqual([50, 50]);
    expect(result.images[0].transform.map(round)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
