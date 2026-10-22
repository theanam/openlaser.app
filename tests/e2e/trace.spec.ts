import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { importFile, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('traces an image into vector layers and burns them', async ({ page }) => {
  await newProject(page);
  await importFile(page, 'logo.png');
  await expect(page.getByTestId('image-inspector')).toBeVisible();
  await page.getByTestId('trace-open').click();

  const dialog = page.getByTestId('trace-dialog');
  await expect(dialog).toContainText(/nodes/, { timeout: 15_000 });
  await page.getByTestId('trace-preset-logo').click();
  await expect(dialog).toContainText(/\d+ colors? · [\d,]+ nodes/, { timeout: 15_000 });
  await page.getByTestId('trace-apply').click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId('layer-row').filter({ hasText: 'Trace' }).first()).toBeVisible();
  // The image is replaced by its trace.
  await expect(page.getByTestId('image-inspector')).toBeHidden();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync(await download.path(), 'utf8');
  expect(gcode.split('\n').length).toBeGreaterThan(50);
});

test('line art traces to one cut layer and can keep the image', async ({ page }) => {
  await newProject(page);
  await importFile(page, 'logo.png');
  await expect(page.getByTestId('image-inspector')).toBeVisible();
  await page.keyboard.press('Shift+T');
  const dialog = page.getByTestId('trace-dialog');
  await page.getByTestId('trace-preset-lineart').click();
  await dialog.getByRole('button', { name: 'Cut outlines' }).click();
  await dialog.getByRole('switch', { name: 'Keep the image underneath' }).click();
  await expect(dialog).toContainText(/nodes/, { timeout: 15_000 });
  await page.getByTestId('trace-apply').click();
  await expect(page.getByTestId('layer-row').filter({ hasText: 'Trace' })).toHaveCount(1);
  await expect(page.getByTestId('layer-row').filter({ hasText: /Trace.*Line/s })).toHaveCount(1);
  await expect(page.getByTestId('status-bar')).toContainText('2 objects');
});

test('a photo trace lands on a few layers that stay when their objects go', async ({ page }) => {
  await newProject(page);
  await importFile(page, 'portrait.png');
  await expect(page.getByTestId('image-inspector')).toBeVisible();
  await page.getByTestId('trace-open').click();
  await page.getByTestId('trace-preset-photo').click();
  await expect(page.getByTestId('trace-dialog')).toContainText(/\d+ colors/, { timeout: 20_000 });
  await page.getByTestId('trace-apply').click();
  const rows = page.getByTestId('layer-row');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(1);
  expect(count).toBeLessThanOrEqual(10);

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('status-bar')).toContainText('0 objects');
  await expect(rows).toHaveCount(count);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('object-row')).toHaveCount(count);
});
