import { expect, test } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('help links to the issue tracker and email', async ({ page }) => {
  await page.goto('/#/help');
  await expect(page.getByTestId('page-help')).toBeVisible();
  await expect(page.getByRole('link', { name: /Report a problem/ })).toHaveAttribute(
    'href',
    'https://github.com/theanam/openlaser.app/issues',
  );
  await expect(page.getByRole('link', { name: /Everything else/ })).toHaveAttribute(
    'href',
    'mailto:anam.ahmed.a@gmail.com',
  );
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
});

test('about shows the version and GitHub link', async ({ page }) => {
  await page.goto('/#/about');
  await expect(page.getByTestId('page-about')).toContainText('Version');
  await expect(page.getByRole('link', { name: 'Source code' })).toHaveAttribute(
    'href',
    'https://github.com/theanam/openlaser.app',
  );
});

test('has search and social metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /laser/i);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  for (const property of ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale', 'og:image:alt']) {
    await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute('content', /\S/);
  }
  for (const name of ['twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
    await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute('content', /\S/);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://openlaser.app/');
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld['@type']).toBe('SoftwareApplication');
});

test('the start screen pictures the safety habits', async ({ page }) => {
  await page.goto('/');
  const safety = page.getByTestId('start-safety');
  await expect(safety.locator('li')).toHaveCount(4);
  await expect(safety).toContainText('Esc');
});

test('the shortcut sheet opens with ?', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
});

test('Help covers a machine that is not showing up', async ({ page }) => {
  await page.goto('/#/help');
  const section = page.getByTestId('help-connect');
  await expect(section).toContainText('Machine not showing up');
  await expect(section).toContainText('Install the USB driver');
});

test('the top bar has the menu after the logo and a connect button until a laser is connected', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page.getByRole('button', { name: 'Print template' })).toHaveCount(0);
  await page.getByTestId('app-menu').click();
  await expect(page.getByRole('menuitem', { name: /Print template/ })).toBeVisible();
  await page.keyboard.press('Escape');

  const connect = page.getByTestId('topbar-connect');
  await expect(connect).toBeVisible();
  await page.getByTestId('connect-virtual').click();
  await expect(connect).toHaveCount(0);
});
