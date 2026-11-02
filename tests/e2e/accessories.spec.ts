import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

async function pickMachine(page: Page, search: string, name: RegExp) {
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill(search);
  await page.getByRole('radio', { name }).click();
}

test('an LP4 picks lasers per layer and switches to its rotary from the machine panel', async ({ page }) => {
  await newProject(page);
  await pickMachine(page, 'laserpecker lp4', /LP4/);
  const setup = page.getByTestId('accessory-picker');
  await expect(setup).toContainText('Flat bed');
  await expect(setup).toContainText('Slide');

  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.45, 0.45], [0.55, 0.55]);
  await page.getByTestId('layer-laser').getByRole('button', { name: '1064 nm infrared' }).click();

  await page.getByTestId('accessory-rotary').click();
  const diameter = page.getByTestId('object-diameter');
  await diameter.fill('50');
  await diameter.press('Enter');
  await expect(page.getByTestId('object-around')).toHaveText('157.1 mm around');
  // The bed becomes the unrolled surface.
  await expect(page.getByText('LaserPecker LP4 · 160 × 157 mm')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  const gcode = readFileSync((await download.path())!, 'utf8').split('\n');
  expect(gcode.slice(0, 4)).toEqual(['G90', 'G21', 'M4 S0', 'M3032']);
  expect(gcode).toContain('M3011');
  expect(gcode).not.toContain('M3010');

  // Back on the flat bed, the job says so.
  await setup.getByRole('button', { name: 'Flat bed' }).click();
  await expect(page.getByText('LaserPecker LP4 · 160 × 120 mm')).toBeVisible();
});

test('an LP2 runs a rotary job on the virtual LaserPecker', async ({ page }) => {
  await newProject(page);
  await pickMachine(page, 'laserpecker lp2', /LP2/);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.45, 0.45], [0.55, 0.55]);
  await page.getByTestId('accessory-rotary').click();
  await page.getByTestId('lp-connect-virtual').click();
  await expect(page.getByTestId('lp-state')).toHaveText('Idle');

  await page.getByTestId('lp-start').click();
  const dialog = page.getByTestId('safety-dialog');
  await expect(dialog).toContainText('Not framed yet');
  for (const box of await dialog.getByTestId('safety-check').all()) await box.check();
  await page.getByTestId('safety-confirm').click();
  // The setup is locked while the job runs.
  await expect(page.getByTestId('accessory-rotary')).toBeDisabled({ timeout: 10_000 });
  await expect(page.getByText('Job complete')).toBeVisible({ timeout: 20_000 });
});

test('machine profiles edit lasers and accessories', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('change-machine').click();
  await page.getByRole('button', { name: 'Edit machine profiles' }).click();
  const hardware = page.getByTestId('profile-hardware');
  await hardware.getByTestId('add-laser').click();
  await hardware.getByTestId('add-laser').click();
  await expect(hardware.getByTestId('laser-row')).toHaveCount(2);
  await hardware.getByTestId('add-rotary').click();
  await expect(hardware.getByTestId('accessory-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('accessory-picker')).toContainText('Rotary');
});
