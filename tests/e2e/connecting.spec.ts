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

test.describe('when the browser has Bluetooth switched off', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  });

  test('the Bluetooth item says Set up and opens the flag guide', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { bluetooth?: unknown }).bluetooth;
    });
    await page.goto('/');
    await page.getByTestId('start-connect-menu').click();
    await expect(page.getByTestId('start-connect-bluetooth')).toContainText('Set up');
    await page.getByTestId('start-connect-bluetooth').click();

    const guide = page.getByTestId('connect-setup');
    await expect(guide).toContainText('Turn on Bluetooth in');
    await expect(guide).toContainText('chrome://flags/#enable-experimental-web-platform-features');
    await expect(guide).toContainText('Experimental Web Platform features');
    await expect(guide.getByTestId('setup-steps').locator('li')).toHaveCount(5);
    await page.getByTestId('connect-setup-done').click();
    await expect(guide).toBeHidden();
  });
});

test('Bluetooth that is off opens the guide to turn it on', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: () =>
          Promise.reject(new DOMException('Bluetooth adapter not available.', 'NotFoundError')),
        getAvailability: () => Promise.resolve(false),
      },
    });
  });
  await page.goto('/');
  await page.getByTestId('start-connect-menu').click();
  await page.getByTestId('start-connect-bluetooth').click();
  const guide = page.getByTestId('connect-setup');
  await expect(guide).toContainText('The computer’s Bluetooth is off or blocked.');
  await expect(page.getByTestId('connect-setup-retry')).toBeVisible();
});

test.describe('in a browser without Web Serial or Bluetooth', () => {
  test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' });

  test('Connect explains which browsers to use', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as { bluetooth?: unknown }).bluetooth;
      delete (Navigator.prototype as { serial?: unknown }).serial;
    });
    await page.goto('/');
    await page.getByTestId('start-connect-main').click();
    const guide = page.getByTestId('connect-setup');
    await expect(guide).toContainText('Use Chrome or Edge');
    await expect(guide.getByRole('link', { name: 'Get Chrome' })).toBeVisible();
  });
});
