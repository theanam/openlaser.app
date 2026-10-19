import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Skips the tour and forces the file-input fallback so tests can drive file choosers. */
export async function prepare(page: Page, options: { tour?: boolean } = {}): Promise<void> {
  await page.addInitScript((showTour) => {
    if (!showTour) localStorage.setItem('openlaser.tour.v1', 'done');
    // Remove the File System Access API so tests drive the file-input and download fallbacks.
    delete window.showOpenFilePicker;
    delete window.showSaveFilePicker;
  }, options.tour ?? false);
}

export async function newProject(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('workspace')).toBeVisible();
}

export async function importFile(page: Page, file: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('tool-image').click(),
  ]);
  await chooser.setFiles(FIXTURES + file);
}

/** Drags on the bed canvas between two points given as fractions of its size. */
export async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await page.mouse.up();
}

export async function connectVirtual(page: Page): Promise<void> {
  await page.getByTestId('connect-virtual').click();
  await expect(page.getByTestId('machine-state')).toHaveText(/ALARM|IDLE/i, { timeout: 15_000 });
  if (/alarm/i.test((await page.getByTestId('machine-state').textContent()) ?? '')) {
    await page.getByTestId('unlock').click();
  }
  await expect(page.getByTestId('machine-state')).toHaveText(/IDLE/i, { timeout: 10_000 });
}
