import { expect, test } from '@playwright/test';
import { prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('the Connect button spins while a chosen laser is still connecting', async ({ page }) => {
  await page.addInitScript(() => {
    // A laser that is picked at once but never finishes opening its link.
    const device = {
      name: 'LP4-F6CC83',
      addEventListener() {},
      removeEventListener() {},
      gatt: { connected: false, connect: () => new Promise(() => {}), disconnect() {} },
    };
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: () => Promise.resolve(device), getAvailability: () => Promise.resolve(true) },
    });
    localStorage.setItem('openlaser.connect.method', 'bluetooth');
  });
  await page.goto('/');
  const main = page.getByTestId('start-connect-main');
  await expect(main).toContainText('Connect laser');
  await page.getByTestId('start-connect-menu').click();
  await page.getByTestId('start-connect-bluetooth').click();

  await expect(page.getByTestId('topbar-connect-main')).toContainText('Connecting…');
  await expect(page.getByTestId('topbar-connect-main')).toBeDisabled();
  await expect(page.getByTestId('topbar-connect-main')).toHaveAttribute('aria-busy', 'true');
});
