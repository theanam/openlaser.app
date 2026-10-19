import { expect, test } from '@playwright/test';
import { prepare } from './helpers';

test('the tour shows on first visit, walks every step and stays dismissed', async ({ page }) => {
  await prepare(page, { tour: true });
  await page.goto('/');
  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  await expect(tour.getByText('Welcome to openlaser')).toBeVisible();
  let steps = 1;
  while (await page.getByTestId('tour-next').isVisible()) {
    await page.getByTestId('tour-next').click();
    steps++;
  }
  expect(steps).toBeGreaterThan(8);
  await expect(tour.getByText('Pick your machine')).toBeVisible();
  await tour.getByTestId('preset-search').fill('ts3');
  await tour.getByRole('radio', { name: /TS3/ }).click();
  await page.getByTestId('tour-finish').click();
  await expect(tour).toBeHidden();
  await expect(page.getByTestId('start-screen')).toContainText('Two Trees TS3');
  await expect(page.getByTestId('start-screen')).toContainText('300 × 200 mm');
  await page.reload();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('tour')).toBeHidden();
});

test('the tour can be skipped and reopened', async ({ page }) => {
  await prepare(page, { tour: true });
  await page.goto('/');
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('tour')).toBeHidden();
  await page.getByRole('button', { name: 'Tour', exact: true }).click();
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / ')).toBeVisible();
});
