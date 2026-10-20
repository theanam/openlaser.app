import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { connectVirtual, dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

async function pickMachine(page: Page, search: string, name: RegExp) {
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill(search);
  await page.getByRole('radio', { name }).click();
}

test('a Ruida CO₂ machine exports .rd files to run from a USB stick', async ({ page }) => {
  await newProject(page);
  await pickMachine(page, 'nova 35', /Nova 35/);
  await expect(page.getByTestId('machine-name')).toHaveText('Thunder Laser Nova 35');
  await expect(page.getByTestId('machine-switcher')).toContainText('CO₂ · Ruida');

  // Nothing to connect to: the panel walks through the USB-stick flow instead.
  await expect(page.getByTestId('ruida-panel')).toBeVisible();
  await expect(page.getByTestId('topbar-connect')).toHaveCount(0);
  await expect(page.getByTestId('connect-virtual')).toHaveCount(0);
  await expect(page.getByTestId('console')).toHaveCount(0);
  await expect(page.getByTestId('export-gcode')).toHaveText('Export .rd');

  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  // CO₂ speeds read in mm/s.
  await expect(page.getByTestId('layer-speed')).toHaveValue(/^\d+(\.\d)?$/);
  await expect(page.getByText('mm/s').first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-rd').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.rd$/);
  const bytes = readFileSync((await download.path())!);
  // Swizzled with magic 0x88: the job opens with D8 10 and ends with D7.
  expect([...bytes.subarray(0, 2)]).toEqual([0xd2, 0x99]);
  expect(bytes.at(-1)).toBe(0x60);
});

test('a CO₂ machine on GRBL burns at constant power and asks about water cooling', async ({ page }) => {
  await newProject(page);
  await pickMachine(page, 'k40', /GRBL board/);
  await expect(page.getByTestId('machine-switcher')).toContainText('CO₂');
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync((await download.path())!, 'utf8');
  expect(gcode.split('\n').slice(0, 3)).toEqual(['G90', 'G21', 'M3 S0']);
  expect(gcode).not.toMatch(/^M4/m);

  // Low power warns that a tube may not fire.
  const power = page.getByTestId('layer-power');
  await power.fill('5');
  await power.press('Enter');
  await expect(page.getByTestId('co2-power-hint')).toBeVisible();

  await connectVirtual(page);
  await page.getByTestId('start-job').click();
  const notHomed = page.getByRole('button', { name: 'Start anyway' });
  await page.getByTestId('safety-dialog').or(notHomed).first().waitFor();
  if (await notHomed.isVisible()) await notHomed.click();
  const dialog = page.getByTestId('safety-dialog');
  await expect(dialog).toContainText('Water cooling running');
  await expect(dialog.getByTestId('safety-check')).toHaveCount(5);
});
