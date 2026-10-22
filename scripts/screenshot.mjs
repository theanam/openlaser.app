/**
 * Captures the README screenshots from a production build. Run after any noticeable UI change:
 *   pnpm build && pnpm screenshot
 * Starts `vite preview` on port 5190 when nothing is listening there.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const URL_BASE = 'http://localhost:5190/';
const fixtures = `${root}tests/e2e/fixtures/`;

async function serverUp() {
  try {
    return (await fetch(URL_BASE)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn('pnpm', ['preview'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
await context.addInitScript(() => {
  localStorage.setItem('openlaser.tour.v1', 'done');
  delete window.showOpenFilePicker;
  delete window.showSaveFilePicker;
});
const page = await context.newPage();

const objects = (n) =>
  page
    .getByTestId('status-bar')
    .filter({ hasText: `${n} object` })
    .waitFor();

async function importFile(name) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('tool-image').click(),
  ]);
  await chooser.setFiles(fixtures + name);
}

async function setField(id, value) {
  const field = page.getByTestId(id);
  await field.fill(String(value));
  await field.press('Enter');
}

await page.goto(URL_BASE);
await page.getByTestId('new-project').click();
await page.getByTestId('project-name').click();
await page.getByRole('textbox', { name: 'Project name' }).fill('Coaster set');
await page.keyboard.press('Enter');

await importFile('coaster.svg');
await page.getByTestId('vector-import-confirm').click();
await objects(2);
await page.getByTestId('vector-import-dialog').waitFor({ state: 'hidden' });
await page.getByTestId('bed-canvas').focus();
await page.keyboard.press('ControlOrMeta+a');
await setField('sel-x', 40);
await setField('sel-y', 250);

await importFile('portrait.png');
await objects(3);
// Keep the photo's proportions while sizing it.
await page.getByRole('button', { name: /Keep aspect ratio/ }).click();
await setField('sel-w', 110);
await page.getByRole('button', { name: /Keep aspect ratio/ }).click();
await setField('sel-x', 190);
await setField('sel-y', 190);
await page.getByTestId('layer-algorithm').selectOption('atkinson');

const box = await page.getByTestId('bed-canvas').boundingBox();
await page.getByTestId('tool-shape').click();
await page.locator('[data-shape="star"]').click();
await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.62);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.8, { steps: 6 });
await page.mouse.up();
await objects(4);

await page.getByTestId('tool-text').click();
await page.mouse.click(box.x + box.width * 0.47, box.y + box.height * 0.66);
await page.waitForTimeout(300);
await page.keyboard.type('Hand made');
await page.getByTestId('font-picker').click();
await page.getByTestId('font-search').fill('pacifico');
await page.keyboard.press('Enter');
await setField('text-size', 18);
await page.waitForTimeout(2500);
await objects(5);
await page.getByTestId('tool-select').click();

await page.getByTestId('connect-virtual').click();
await page.getByTestId('unlock').click({ timeout: 15_000 });
await page.getByTestId('machine-state').filter({ hasText: /idle/i }).waitFor({ timeout: 10_000 });
for (const close of await page.getByRole('button', { name: 'Dismiss' }).all()) await close.click();
await page.getByTestId('bed-canvas').focus();
await page.keyboard.press('ControlOrMeta+a');
await page.waitForTimeout(2600);
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
// Unlock scrolled the side column to the machine panel; show the layers again.
await page.locator('aside > div').first().evaluate((el) => (el.scrollTop = 0));
await page.waitForTimeout(200);
await page.screenshot({ path: `${root}docs/screenshot.png` });
console.log('wrote docs/screenshot.png');

await page.getByTestId('view-preview').click();
await page.getByTestId('preview-lines').filter({ hasNotText: '0 / 0' }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
await page.getByTestId('preview-scrubber').fill('9000');
await page.waitForTimeout(500);
await page.screenshot({ path: `${root}docs/screenshot-preview.png` });
console.log('wrote docs/screenshot-preview.png');

await context.close();
const tourContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const tour = await tourContext.newPage();
await tour.goto(URL_BASE);
await tour.getByTestId('tour').waitFor();
for (let i = 0; i < 4; i++) await tour.getByTestId('tour-next').click();
await tour.waitForTimeout(2600);
await tour.screenshot({ path: `${root}docs/screenshot-tour.png` });
console.log('wrote docs/screenshot-tour.png');

await browser.close();
server?.kill();
