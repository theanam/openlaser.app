import { expect, test, type Page } from '@playwright/test';
import { connectVirtual, dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

/** Every visible icon button must resolve to tooltip text (aria-label, title or data-tip). */
async function iconButtonsWithoutTips(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.icon-btn')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => !(el.dataset.tip || el.getAttribute('title') || el.getAttribute('aria-label'))?.trim())
      .map((el) => el.outerHTML.slice(0, 120)),
  );
}

test('every icon button has a tooltip', async ({ page }) => {
  await page.goto('/');
  expect(await iconButtonsWithoutTips(page)).toEqual([]);
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.4, 0.4], [0.5, 0.5]);
  await connectVirtual(page);
  expect(await iconButtonsWithoutTips(page)).toEqual([]);
});

test('hovering an icon button shows its tooltip', async ({ page }) => {
  await newProject(page);
  await page.getByRole('button', { name: 'Undo' }).hover();
  await expect(page.getByTestId('tooltip')).toHaveText(/Undo/);
  await page.getByTestId('tool-ellipse').hover();
  await expect(page.getByTestId('tooltip')).toHaveText(/Ellipse/);
  await page.mouse.move(5, 500);
  await expect(page.getByTestId('tooltip')).toBeHidden();
});

test('set origin, console and machine switcher are reachable', async ({ page }) => {
  await newProject(page);
  await connectVirtual(page);
  await expect(page.getByTestId('console')).toContainText('Grbl');
  await page.getByTestId('set-origin').click();
  await expect(page.getByTestId('job-origin')).toContainText('0.000, 0.000');
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill('ts3');
  await page.getByRole('radio', { name: /TS3/ }).click();
  await expect(page.getByTestId('machine-name')).toHaveText('Two Trees TS3');
});
