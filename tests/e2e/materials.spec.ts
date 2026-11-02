import { expect, test, type Page } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

async function pick(page: Page, search: string, name: RegExp) {
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill(search);
  await page.getByRole('radio', { name }).click();
}

test('a LaserPecker layer takes LaserPecker’s own settings for a material', async ({ page }) => {
  await newProject(page);
  await pick(page, 'laserpecker lp3', /LP3/);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);

  await page.getByTestId('material-picker').click();
  await expect(page.getByTestId('material-list')).toBeVisible();
  await page.getByTestId('material-engrave').click();
  await page.getByPlaceholder('Search materials').fill('stainless');
  await page.getByTestId('material-preset').first().click();

  await expect(page.getByTestId('material-picker')).toContainText('Stainless Steel');
  await expect(page.getByTestId('mode-fill')).toHaveAttribute('aria-pressed', 'true');
  // Editing a value leaves the preset behind.
  const power = page.getByTestId('layer-power');
  await power.fill('12');
  await power.press('Enter');
  await expect(page.getByTestId('material-picker')).toContainText('Pick a material');
});

test('reopening the picker shows the applied preset with its laser and resolution', async ({ page }) => {
  await newProject(page);
  await pick(page, 'laserpecker lp4', /LP4(?! Bluetooth)/);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);

  await page.getByTestId('material-picker').click();
  await page.getByTestId('material-engrave').click();
  const pop = page.locator('.material-pop');
  await pop.getByRole('button', { name: '1064 nm' }).click();
  await pop.getByRole('button', { name: '4K' }).click();
  await page.getByTestId('material-preset').first().click();
  await expect(page.getByTestId('material-picker')).toContainText('1064 nm · 4K');

  await page.getByTestId('material-picker').click();
  await expect(pop.getByRole('button', { name: '4K' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.material-pop .row.on')).toBeVisible();
});
