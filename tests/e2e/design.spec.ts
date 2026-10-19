import { expect, test } from '@playwright/test';
import { dragOnCanvas, importFile, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('draws shapes, edits numbers, undoes and redoes', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.55, 0.55]);
  await expect(page.getByTestId('status-bar')).toContainText('1 object');
  await expect(page.getByTestId('layer-row')).toHaveCount(1);

  const w = page.getByTestId('sel-w');
  await w.fill('50');
  await w.press('Enter');
  await expect(w).toHaveValue('50.000');

  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.getByTestId('status-bar')).toContainText('2 objects');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('status-bar')).toContainText('1 object');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByTestId('status-bar')).toContainText('2 objects');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('status-bar')).toContainText('0 objects');
});

test('imports an SVG with a color to layer mapping and an image', async ({ page }) => {
  await newProject(page);
  await importFile(page, 'coaster.svg');
  const dialog = page.getByTestId('vector-import-dialog');
  await expect(dialog).toContainText('90.0 × 90.0 mm');
  await page.getByTestId('vector-import-confirm').click();
  await expect(page.getByTestId('layer-row').first()).toBeVisible();
  const before = await page.getByTestId('layer-row').count();
  expect(before).toBeGreaterThanOrEqual(2);

  await importFile(page, 'portrait.png');
  await expect(page.getByTestId('layer-row')).toHaveCount(before + 1);
  await expect(page.getByTestId('layer-algorithm')).toBeVisible();
  await page.getByTestId('layer-algorithm').selectOption('atkinson');
});

test('imports a DXF in its units with layer colors', async ({ page }) => {
  await newProject(page);
  await importFile(page, 'box.dxf');
  const dialog = page.getByTestId('vector-import-dialog');
  await expect(dialog).toContainText('60.0 × 40.0 mm');
  await expect(dialog).toContainText('#ff0000');
  await expect(dialog).toContainText('#0000ff');
  await expect(dialog).toContainText('1 × text');
  await dialog.getByTestId('dxf-units').getByRole('button', { name: 'cm' }).click();
  await expect(dialog).toContainText('600.0 × 400.0 mm');
  await dialog.getByTestId('dxf-units').getByRole('button', { name: 'mm' }).click();
  await page.getByTestId('vector-import-confirm').click();
  await expect(page.getByTestId('layer-row')).toHaveCount(2);
  await expect(page.getByTestId('status-bar')).toContainText('2 objects');
});

test('previews the job and scrubs through it', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-ellipse').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.6]);
  await page.getByTestId('view-preview').click();
  await expect(page.getByTestId('preview-lines')).not.toContainText('0 / 0', { timeout: 15_000 });
  await page.getByTestId('preview-scrubber').fill('3');
  await expect(page.getByTestId('preview-lines')).toContainText('/');
});

test('keyboard shortcuts stay out of text fields', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  const w = page.getByTestId('sel-w');
  await w.click();
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('status-bar')).toContainText('1 object');
});

test('width and height edit independently, and drawing returns to Select', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.5]);
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-rect')).toHaveAttribute('aria-pressed', 'false');

  const w = page.getByTestId('sel-w');
  const h = page.getByTestId('sel-h');
  const hBefore = await h.inputValue();
  await w.click();
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await expect(w).toHaveValue('100.000');
  await expect(h).toHaveValue(hBefore);

  await h.click();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(h).toHaveValue('20.000');
  await expect(w).toHaveValue('100.000');

  await page.getByRole('button', { name: /Keep aspect ratio/ }).click();
  await w.click();
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(h).toHaveValue('10.000');
});

test('fine-grained fields have up/down carets that step the value', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.5]);
  const w = page.getByTestId('sel-w');
  const start = Number(await w.inputValue());
  await page.getByTestId('sel-w-up').click();
  await expect.poll(async () => Number(await w.inputValue())).toBeCloseTo(start + 0.1, 3);
  await page.getByTestId('sel-w-down').click({ modifiers: ['Shift'] });
  await expect.poll(async () => Number(await w.inputValue())).toBeCloseTo(start - 0.9, 3);
  // One press is one undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => Number(await w.inputValue())).toBeCloseTo(start + 0.1, 3);
  // Whole-number fields step too.
  const speed = page.getByTestId('layer-speed');
  const before = Number(await speed.inputValue());
  await page.getByTestId('layer-speed-up').click();
  await expect.poll(async () => Number(await speed.inputValue())).toBe(before + 10);
});

test('power has a preset dropdown and still takes typed values', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.6, 0.5]);
  const power = page.getByTestId('layer-power');
  await page.getByTestId('layer-power-presets').click();
  await page.getByRole('menuitem', { name: '30%' }).click();
  await expect(power).toHaveValue('30');
  await power.fill('37');
  await power.press('Enter');
  await expect(power).toHaveValue('37');
  await expect(page.getByTestId('layer-row')).toContainText('37%');
});

test('layers are never empty: click selects their objects, + moves the selection to a new layer', async ({
  page,
}) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.2, 0.2], [0.3, 0.3]);
  await page.getByTestId('tool-ellipse').click();
  await dragOnCanvas(page, [0.5, 0.5], [0.6, 0.6]);
  const rows = page.getByTestId('layer-row');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('new-layer')).toBeEnabled();

  // Ellipse is selected: move it to a new fill layer.
  await page.getByTestId('new-layer').click();
  await page.getByRole('menuitem', { name: 'New fill layer' }).click();
  await expect(rows).toHaveCount(2);

  // Clicking the first layer selects what is on it.
  await rows.first().click();
  await expect(page.getByTestId('status-bar')).toContainText('1 selected');

  // Deleting the last object on a layer removes the layer too.
  await page.keyboard.press('Delete');
  await expect(rows).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('new-layer')).toBeDisabled();
});

test('the Image tool sits with the other tools and takes SVG and images', async ({ page }) => {
  await newProject(page);
  const rail = page.getByRole('navigation', { name: 'Tools' });
  const tool = rail.getByTestId('tool-image');
  await expect(tool).toBeVisible();
  // Between Text and Measure, not pushed to the bottom.
  const text = (await rail.getByTestId('tool-text').boundingBox())!;
  const measure = (await rail.getByTestId('tool-measure').boundingBox())!;
  const image = (await tool.boundingBox())!;
  expect(image.y).toBeGreaterThan(text.y);
  expect(image.y).toBeLessThan(measure.y);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tool.click()]);
  const accept = (await chooser.element().getAttribute('accept')) ?? '';
  expect(accept).toContain('.svg');
  expect(accept).toContain('.dxf');
  expect(accept).toContain('.png');
  expect(accept).not.toContain('.olaser');
  expect(accept).not.toContain('.gcode');
  await expect(page.getByTestId('empty-hint')).toContainText('drop files here');
});

test('Open takes projects and G-code only', async ({ page }) => {
  await newProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('ControlOrMeta+o'),
  ]);
  const accept = (await chooser.element().getAttribute('accept')) ?? '';
  expect(accept).toContain('.olaser');
  expect(accept).toContain('.gcode');
  expect(accept).not.toContain('.svg');
  expect(accept).not.toContain('.png');
});
