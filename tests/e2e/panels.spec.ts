import { expect, test } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('the side panel runs machine, layers, then the selection, and sections fold', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-text').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  await expect(page.getByTestId('text-inspector')).toBeVisible();

  const side = page.locator('.side-scroll');
  const order = await side
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(order).toEqual(['section-machine', 'section-layers', 'section-inspector']);

  // Folding keeps the head, hides the rest, and is remembered after a reload.
  await page.getByTestId('section-layers').click();
  await expect(page.getByTestId('section-layers')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('layer-settings')).toHaveCount(0);
  // Let the autosave land, so the reload reopens the project.
  await expect(page.getByText('Saved in browser')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('section-layers')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('section-layers').click();
  await expect(page.getByTestId('layer-settings')).toBeVisible();
});

test('starting a machine from the welcome page folds the Machine section', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('try-virtual').click();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByTestId('section-machine')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('change-machine')).toHaveCount(0);
});

test('a reload carries on in the project; a new visit starts on the welcome page', async ({
  page,
  context,
}) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  // Let the autosave land.
  await expect(page.getByText('Saved in browser')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('workspace')).toBeVisible();

  const visit = await context.newPage();
  await visit.goto('/');
  await expect(visit.getByTestId('start-screen')).toBeVisible();
  await expect(visit.locator('.recent-open')).toHaveCount(1);
});
