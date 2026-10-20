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

test('a tooltip still waiting to appear is dropped when the pointer moves away', async ({ page }) => {
  await newProject(page);
  // Brush over the Absolute origin button and on to bare panel space, quicker than the delay.
  const over = (await page.getByRole('button', { name: 'Absolute' }).boundingBox())!;
  const bare = (await page.getByText('Job origin', { exact: true }).boundingBox())!;
  await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2);
  await page.mouse.move(bare.x + bare.width / 2, bare.y + bare.height / 2);
  await page.waitForTimeout(700);
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
});

test('a tooltip goes away even when its pointerout is missed', async ({ page }) => {
  await newProject(page);
  const absolute = (await page.getByRole('button', { name: 'Absolute' }).boundingBox())!;
  const help = (await page.getByTestId('connect-help-open').boundingBox())!;
  await page.mouse.move(absolute.x + absolute.width / 2, absolute.y + absolute.height / 2, { steps: 4 });
  await expect(page.getByTestId('tooltip')).toHaveText(/Bed coordinates/);
  // Swallow hover transitions, as when the control is re-rendered under the pointer.
  await page.evaluate(() => {
    for (const type of ['pointerout', 'pointerover']) {
      window.addEventListener(type, (e) => e.stopPropagation(), true);
    }
  });
  await page.mouse.move(help.x + help.width / 2, help.y + help.height / 2, { steps: 8 });
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
});
