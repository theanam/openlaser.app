import { expect, test, type Page } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const position = async (page: Page) =>
  Promise.all(['sel-x', 'sel-y', 'sel-w', 'sel-h'].map((id) => page.getByTestId(id).inputValue()));

async function pick(page: Page, search: string, name: RegExp) {
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill(search);
  await page.getByRole('radio', { name }).click();
}

test('switching between machines homed in different corners keeps the design in place', async ({ page }) => {
  await newProject(page);
  // A library heart: it would show upside down if the design were not re-laid out.
  await page.getByTestId('tool-shape').click();
  await page.getByTestId('shape-search').fill('heart');
  await page.locator('[data-shape="heart"]').click();
  await dragOnCanvas(page, [0.1, 0.8], [0.2, 0.9]);
  const before = await position(page);

  // Bottom-left GRBL to top-left LaserPecker: same machine position.
  await pick(page, 'laserpecker lp2', /LP2/);
  await expect(page.getByTestId('machine-name')).toHaveText('LaserPecker LP2');
  await page.getByTestId('object-row').first().click();
  expect(await position(page)).toEqual(before);

  // The whole machine card opens the picker, and switching back restores the layout exactly.
  await page.getByTestId('change-machine').click();
  await page.getByRole('button', { name: /Generic GRBL laser/ }).click();
  await page.getByTestId('object-row').first().click();
  expect(await position(page)).toEqual(before);
});
