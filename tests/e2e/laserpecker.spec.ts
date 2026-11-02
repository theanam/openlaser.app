import { expect, test } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('a LaserPecker frames, engraves and stops through its own panel', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill('laserpecker lp2');
  await page.getByRole('radio', { name: /LP2/ }).click();
  await expect(page.getByTestId('machine-name')).toHaveText('LaserPecker LP2');
  await expect(page.getByTestId('machine-switcher')).toContainText('100 × 100 mm · LaserPecker');

  const panel = page.getByTestId('laserpecker-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('connect-virtual')).toHaveCount(0);
  await expect(page.getByTestId('console')).toHaveCount(0);
  await expect(page.getByTestId('job-origin')).toHaveCount(0);

  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.45, 0.45], [0.55, 0.55]);

  // Burn settings live on the layer, in LaserPecker's own terms: depth, not a speed.
  await expect(page.getByTestId('layer-settings').getByText('Depth', { exact: true })).toBeVisible();
  await expect(page.getByTestId('layer-settings').getByText('Overscan')).toHaveCount(0);
  await page.getByTestId('lp-connect-virtual').click();
  await expect(page.getByTestId('lp-state')).toHaveText('Idle');
  await expect(panel).toContainText('LP2 3.16');
  await expect(page.getByTestId('lp-power')).toHaveCount(0);
  // Stop shows as soon as the laser is connected; it is live once something runs.
  const stop = page.getByTestId('stop');
  await expect(stop).toBeVisible();
  await expect(stop).toBeDisabled();

  // Framing fires the beam, so it asks once.
  await page.getByTestId('lp-frame').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('laser glasses');
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Frame' }).click();
  await expect(page.getByTestId('lp-state')).toHaveText('Framing');
  await expect(stop).toBeEnabled();
  await page.getByTestId('lp-stop-frame').click();
  await expect(page.getByTestId('lp-state')).toHaveText('Idle', { timeout: 5000 });

  // The pre-flight knows the job was framed.
  await page.getByTestId('lp-start').click();
  const dialog = page.getByTestId('safety-dialog');
  await expect(dialog).toContainText('Framed');
  for (const box of await dialog.getByTestId('safety-check').all()) await box.click();
  await page.getByTestId('safety-confirm').click();
  await expect(page.getByTestId('lp-progress')).toContainText('Engraving', { timeout: 10_000 });
  await expect(page.getByTestId('lp-pause')).toBeVisible();
  await expect(page.getByText('Job complete')).toBeVisible({ timeout: 20_000 });

  // A second job, stopped with Esc.
  await page.getByTestId('lp-start').click();
  await page.getByTestId('safety-confirm').click();
  await expect(page.getByTestId('lp-progress')).toContainText('Engraving', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByText('Job stopped')).toBeVisible();
  await expect(page.getByTestId('lp-state')).toHaveText('Idle');

  await panel.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByTestId('lp-state')).toHaveText('Offline');
  await expect(stop).toHaveCount(0);
});

test('Stop stays on Help while a LaserPecker is connected', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill('laserpecker lp3');
  await page.getByRole('radio', { name: /LP3/ }).click();
  await page.getByTestId('lp-connect-virtual').click();
  await expect(page.getByTestId('lp-state')).toHaveText('Idle');
  // Picking another machine keeps the connected one's panel and Stop on screen.
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill('ts3');
  await page.getByRole('radio', { name: /TS3/ }).click();
  await expect(page.getByTestId('laserpecker-panel')).toBeVisible();
  await expect(page.getByTestId('lp-controls').getByTestId('stop')).toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByTestId('page-help').getByTestId('stop')).toBeVisible();
});
