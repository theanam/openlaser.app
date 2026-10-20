import { expect, test } from '@playwright/test';
import { connectVirtual, dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('connects to the virtual machine, jogs and homes', async ({ page }) => {
  await newProject(page);
  await connectVirtual(page);
  await expect(page.getByTestId('stop')).toBeVisible();
  await page.getByTestId('jog-1-0').click();
  await expect(page.getByTestId('position')).toContainText('X 10.000', { timeout: 10_000 });
  await page.getByTestId('home').click();
  await expect(page.getByTestId('status-bar')).toContainText('Homed', { timeout: 10_000 });
});

test('frames, runs, pauses, resumes and stops a job', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.3, 0.3], [0.7, 0.7]);
  await connectVirtual(page);

  await page.getByTestId('frame').click();
  await page
    .getByRole('button', { name: 'Start anyway' })
    .click({ timeout: 2000 })
    .catch(() => undefined);
  await expect(page.getByTestId('job-progress')).toBeVisible();
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 30_000 });

  await page.getByTestId('start-job').click();
  const homed = page.getByRole('button', { name: 'Start anyway' });
  if (await homed.isVisible({ timeout: 1500 }).catch(() => false)) await homed.click();
  await expect(page.getByTestId('safety-dialog')).toBeVisible();
  for (const box of await page.getByTestId('safety-check').all()) await box.check();
  await page.getByTestId('safety-confirm').click();

  await expect(page.getByTestId('pause')).toBeVisible();
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('machine-state')).toHaveText(/HOLD/i, { timeout: 10_000 });
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('machine-state')).toHaveText(/RUN/i, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByText('Job stopped')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('start-job')).toBeVisible();
});

test('the console sends commands and shows replies', async ({ page }) => {
  await newProject(page);
  await connectVirtual(page);
  // The console opens by itself on connect.
  await expect(page.getByTestId('console-input')).toBeVisible();
  await page.getByTestId('console-input').fill('$I');
  await page.getByTestId('console-input').press('Enter');
  await expect(page.getByTestId('console')).toContainText('[VER:');
});

test('framing loops until stopped, with low power after a warning', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.45, 0.45], [0.5, 0.5]);
  await connectVirtual(page);

  await page.getByTestId('frame-power-presets').click();
  await page.getByRole('menuitem', { name: '1%' }).click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('safety glasses');
  await page.getByRole('button', { name: 'Frame with the laser on' }).click();
  await expect(page.getByTestId('frame-power')).toHaveValue('1.0');

  await page.getByTestId('frame-repeat').click();
  await expect(page.getByTestId('frame')).toHaveText(/Frame until stopped/);
  await page.getByTestId('frame').click();
  await expect(page.getByTestId('frame-panel')).toContainText('Pass 2', { timeout: 30_000 });
  await page.getByTestId('frame-stop-loop').click();
  await expect(page.getByTestId('frame')).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 15_000 });
});

/** Start job, then accept the "not homed" question if the unhomed virtual machine asks it. */
async function startJob(page: import('@playwright/test').Page) {
  await page.getByTestId('start-job').click();
  const notHomed = page.getByRole('button', { name: 'Start anyway' });
  await page.getByTestId('safety-dialog').or(notHomed).first().waitFor();
  if (await notHomed.isVisible()) await notHomed.click();
}

test('the pre-flight shows the job, asks to frame first, and remembers checks', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.45, 0.45], [0.5, 0.5]);
  await connectVirtual(page);

  await startJob(page);
  const dialog = page.getByTestId('safety-dialog');
  await expect(dialog).toContainText('Not framed yet');
  await expect(dialog).toContainText('% max');
  await expect(page.getByTestId('safety-confirm')).toBeDisabled();
  await page.getByTestId('safety-frame').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 30_000 });
  await page.waitForTimeout(500);

  await startJob(page);
  await expect(dialog).toContainText('Framed.');
  for (const box of await page.getByTestId('safety-check').all()) await box.click();
  await page.getByTestId('safety-confirm').click();
  await expect(page.getByTestId('job-progress')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Job stopped')).toBeVisible({ timeout: 10_000 });

  // Second start in the session: hazards come pre-confirmed.
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE|ALARM/i, { timeout: 15_000 });
  if (/alarm/i.test((await page.getByTestId('machine-state').textContent()) ?? ''))
    await page.getByTestId('unlock').click();
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 15_000 });
  await startJob(page);
  await expect(page.getByTestId('safety-confirm')).toBeEnabled();
  await expect(dialog).toContainText('Confirmed earlier this session');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('Stop is only active while something runs, and never strands the machine in Hold', async ({ page }) => {
  await newProject(page);
  await connectVirtual(page);
  const stop = page.getByTestId('stop');
  await expect(stop).toBeDisabled();

  // A long jog: Stop cancels it and the machine settles at Idle.
  const input = page.getByTestId('console-input');
  await input.fill('$J=G91 G21 X300 F600');
  await input.press('Enter');
  await expect(page.getByTestId('machine-state')).toHaveText(/JOG/i, { timeout: 10_000 });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 10_000 });
  await expect(page.getByTestId('hold-banner')).toBeHidden();
  await expect(stop).toBeDisabled();

  // A manual move: Stop holds and resets, so nothing is left queued.
  await input.fill('G1 X200 F300');
  await input.press('Enter');
  await expect(page.getByTestId('machine-state')).toHaveText(/RUN/i, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE|ALARM/i, { timeout: 10_000 });
  await expect(page.getByTestId('machine-state')).not.toHaveText(/HOLD/i);
});

test('the console follows new lines, and auto-scroll can be turned off', async ({ page }) => {
  await newProject(page);
  await connectVirtual(page);
  const input = page.getByTestId('console-input');
  const log = page.getByTestId('console').getByRole('log');
  const gap = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

  for (let i = 0; i < 3; i++) {
    await input.fill('$$');
    await input.press('Enter');
  }
  await expect.poll(gap).toBeLessThan(4);

  await page.getByTestId('console-autoscroll').click();
  await expect(page.getByTestId('console-autoscroll')).toHaveAttribute('aria-pressed', 'false');
  await log.evaluate((el) => (el.scrollTop = 0));
  await input.fill('$$');
  await input.press('Enter');
  await page.waitForTimeout(600);
  expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
});

test('walks through a laser that is not showing up', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('connect-help-open').click();
  const dialog = page.getByTestId('connect-help-dialog');
  await expect(dialog).toContainText('Power on the laser');
  await dialog.getByRole('button', { name: 'Bluetooth' }).click();
  await expect(dialog).toContainText('Pair the laser');
  await dialog.getByTestId('connect-platform').getByRole('button', { name: 'Linux' }).click();
  await expect(dialog).toContainText('sudo usermod -aG dialout $USER');
  await dialog.getByTestId('connect-platform').getByRole('button', { name: 'Windows' }).click();
  await expect(dialog).toContainText('Device Manager');
  await dialog.getByRole('button', { name: 'Try the virtual machine' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('machine-state')).toHaveText(/ALARM|IDLE/i, { timeout: 15_000 });
});
