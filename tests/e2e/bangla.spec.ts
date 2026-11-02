import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { newProject, prepare } from './helpers';

const font = (name: string) => readFileSync(new URL(`../fixtures/fonts/${name}`, import.meta.url));
const LATIN = font('noto-sans-bengali-latin-400-normal.ttf');
const BENGALI = font('noto-sans-bengali-bengali-400-normal.ttf');

test.beforeEach(async ({ page }) => {
  await prepare(page);
  // Fontsource serves one file per subset: answer the Bengali one with the Bengali fixture.
  await page.route('https://cdn.jsdelivr.net/fontsource/**', (route) => {
    const bengali = route.request().url().includes('/bengali-');
    return route.fulfill({ body: bengali ? BENGALI : LATIN, contentType: 'font/ttf' });
  });
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' }),
  );
});

test('Bangla text in a Bengali font shapes, outlines and burns', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.keyboard.type('আমার সোনার বাংলা');
  await page.keyboard.press('Escape');

  // The picker offers fonts with these letters first.
  await page.getByTestId('font-picker').click();
  await expect(page.getByTestId('font-script')).toHaveText('Bangla');
  await expect(page.getByTestId('font-script')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('font-search').fill('noto sans bengali');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('font-picker')).toContainText('Noto Sans Bengali');

  // Real outlines: the selection changes from the size estimate (88 mm wide) to the shaped words.
  await expect
    .poll(async () => Number(await page.getByTestId('sel-w').inputValue()), { timeout: 15_000 })
    .not.toBe(88);
  await expect(page.getByText(/has no letters/)).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync(await download.path(), 'utf8');
  expect(gcode.split('\n').filter((l) => /S\d+/.test(l) && !/S0\b/.test(l)).length).toBeGreaterThan(50);
});

test('Bangla in a font without Bangla letters falls back to Noto Sans Bengali, quietly', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  // The default font (Geist) has no Bangla: the letters come from the fallback.
  await page.keyboard.type('আমার সোনার বাংলা');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('font-picker')).toContainText('Geist');
  // The fallback's letters burn: with nothing drawn the export would be empty.
  await expect
    .poll(async () => Number(await page.getByTestId('sel-w').inputValue()), { timeout: 15_000 })
    .not.toBe(88);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync(await download.path(), 'utf8');
  expect(gcode.split('\n').filter((l) => /S\d+/.test(l) && !/S0\b/.test(l)).length).toBeGreaterThan(50);
  await expect(page.getByText(/has no letters|could not be drawn/)).toHaveCount(0);
});
