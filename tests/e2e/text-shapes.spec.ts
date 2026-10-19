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
