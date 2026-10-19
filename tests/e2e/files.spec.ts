import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('saves a project as .olaser and opens it again', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('project-name').click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Coaster set');
  await page.keyboard.press('Enter');
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.55, 0.55]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('ControlOrMeta+s'),
  ]);
  expect(download.suggestedFilename()).toBe('Coaster set.olaser');
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK');

  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.getByTestId('project-name')).toHaveText('Untitled');

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('ControlOrMeta+o'),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('project-name')).toHaveText('Coaster set');
  await expect(page.getByTestId('status-bar')).toContainText('1 object');
});

test('reload restores the open project', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-ellipse').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.55, 0.55]);
  await expect(page.getByText('Saved in browser')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByTestId('status-bar')).toContainText('1 object');
});

test('exports G-code', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-gcode').click(),
  ]);
  expect(download.suggestedFilename()).toBe('Untitled.gcode');
  const text = readFileSync(await download.path(), 'utf8');
  expect(text.startsWith('G90\nG21\nM4 S0')).toBe(true);
});
