import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dragOnCanvas, FIXTURES, newProject, prepare } from './helpers';

const TTF = readFileSync(new URL('../fixtures/fonts/geist-latin-400-normal.ttf', import.meta.url));

test.beforeEach(async ({ page }) => {
  await prepare(page);
  // Fonts come from the Fontsource CDN and previews from Google Fonts; serve them locally.
  await page.route('https://cdn.jsdelivr.net/fontsource/**', (route) =>
    route.fulfill({ body: TTF, contentType: 'font/ttf' }),
  );
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' }),
  );
  void FIXTURES;
});

test('the text tool sets text in a Google Font and burns its outlines', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  const field = page.getByTestId('text-content');
  await expect(field).toBeFocused();
  await page.keyboard.type('Laser');
  await expect(field).toHaveValue('Laser');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  // Outlines arrive: the selection gets a real width.
  await expect.poll(async () => Number(await page.getByTestId('sel-w').inputValue())).toBeGreaterThan(10);

  await page.getByTestId('font-picker').click();
  await page.getByTestId('font-search').fill('roboto mono');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('font-picker')).toContainText('Roboto Mono');

  const size = page.getByTestId('text-size');
  await size.fill('20');
  await size.press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('sel-h').inputValue())).toBeGreaterThan(12);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync(await download.path(), 'utf8');
  expect(gcode.split('\n').filter((l) => /S\d+/.test(l) && !/S0\b/.test(l)).length).toBeGreaterThan(10);
});

test('the shapes tool draws a library shape with editable parameters', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-shape').click();
  await page.getByTestId('shape-search').fill('heart');
  await page.locator('[data-shape="heart"]').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6]);
  const inspector = page.getByTestId('shape-inspector');
  await expect(inspector).toContainText('Heart');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('tool-shape').click();
  await page.locator('[data-shape="cog"]').click();
  await dragOnCanvas(page, [0.1, 0.1], [0.3, 0.3]);
  await expect(inspector).toContainText('Cog');
  const teeth = inspector.getByLabel('Teeth', { exact: true });
  await teeth.fill('16');
  await teeth.press('Enter');
  await expect(teeth).toHaveValue('16');
  await expect(page.getByTestId('status-bar')).toContainText('2 objects');
});

test('the console sits in the side panel and is always visible', async ({ page }) => {
  await newProject(page);
  const console = page.getByTestId('console');
  await expect(console).toBeVisible();
  const panel = (await page.getByTestId('machine-panel').boundingBox())!;
  const consoleBox = (await console.boundingBox())!;
  expect(consoleBox.x).toBeGreaterThanOrEqual(panel.x - 1);
  expect(consoleBox.y).toBeGreaterThan(panel.y);
});

async function addText(page: import('@playwright/test').Page) {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.keyboard.type('Key');
}

test('uploads a font file and sets text in it', async ({ page }) => {
  await addText(page);
  await page.getByTestId('font-picker').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('font-upload').click(),
  ]);
  expect(await chooser.element().getAttribute('accept')).toContain('.ttf');
  await chooser.setFiles({ name: 'MyFont.ttf', mimeType: 'font/ttf', buffer: TTF });
  await expect(page.getByTestId('font-picker')).toContainText('Geist');
  await expect(page.getByTestId('font-picker')).toContainText('Uploaded');
  await expect.poll(async () => Number(await page.getByTestId('sel-w').inputValue())).toBeGreaterThan(5);

  // Kept for the next visit.
  await page.reload();
  await page.getByTestId('tool-select').waitFor();
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.getByTestId('font-picker').click();
  await page.getByRole('button', { name: 'Uploaded', exact: true }).click();
  await expect(page.getByRole('option', { name: /Geist/ })).toBeVisible();
});

test('lists installed system fonts once allowed', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { queryLocalFonts: () => Promise<unknown[]> }).queryLocalFonts = async () => [
      {
        family: 'Workshop Sans',
        fullName: 'Workshop Sans',
        postscriptName: 'WorkshopSans',
        style: 'Regular',
        blob: async () => new Blob(),
      },
    ];
  });
  await addText(page);
  await page.getByTestId('font-picker').click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByTestId('system-fonts-load').click();
  await expect(page.getByRole('option', { name: /Workshop Sans/ })).toBeVisible();
});

test('editing text keeps it where it is', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  const field = page.getByTestId('text-content');
  await page.keyboard.type('HI');
  await expect.poll(async () => Number(await page.getByTestId('sel-w').inputValue())).toBeGreaterThan(5);
  // Flat-bottomed capitals sit exactly on the baseline, so the block's bottom edge must not move as letters are added.
  const y = async () => Number(await page.getByTestId('sel-y').inputValue());
  const width = async () => Number(await page.getByTestId('sel-w').inputValue());
  // The first outline replaces the size estimate shown while the font loads; measure after it.
  await expect(page.getByLabel('Loading font')).toHaveCount(0);
  let before = await width();
  const start = await y();
  for (const letter of ['L', 'T', 'E', 'F']) {
    await field.press(`Shift+${letter}`);
    await expect.poll(width).toBeGreaterThan(before);
    before = await width();
    expect(await y()).toBeCloseTo(start, 2);
  }
});
