import { expect, test, type Page } from '@playwright/test';
import { dragOnCanvas, newProject, prepare } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

async function pick(page: Page, search: string, name: RegExp) {
  await page.getByTestId('change-machine').click();
  await page.getByTestId('preset-search').fill(search);
  await page.getByRole('radio', { name }).click();
}

const num = async (page: Page, id: string) => Number(await page.getByTestId(id).inputValue());

test('a smaller machine brings the design along, and art off the bed is flagged', async ({ page }) => {
  await newProject(page);
  // A large rectangle on the 400 mm generic bed.
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.3, 0.3], [0.7, 0.7]);
  expect(await num(page, 'sel-w')).toBeGreaterThan(120);

  await pick(page, 'laserpecker lp2', /LP2/);
  await expect(page.getByText('Design resized to fit the work area.')).toBeVisible();
  await page.getByTestId('object-row').first().click();
  expect(await num(page, 'sel-w')).toBeLessThanOrEqual(100);
  await expect(page.getByTestId('bed-warning')).toHaveCount(0);

  // Pushed off the bed: the warning says so, and Move in brings it back.
  const x = page.getByTestId('sel-x');
  await x.fill('300');
  await x.press('Enter');
  await expect(page.getByTestId('bed-warning')).toContainText('1 object is outside the work area');
  await page.getByTestId('bed-warning-fit').click();
  await expect(page.getByTestId('bed-warning')).toHaveCount(0);
});

test('dragging snaps edges to other objects; Alt drags freely', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.2, 0.2], [0.3, 0.3]);
  const left = await num(page, 'sel-x');
  await page.getByTestId('tool-rect').click();
  await dragOnCanvas(page, [0.6, 0.6], [0.65, 0.65]);

  // Drag the second rectangle by its top edge (clear of the handles) until its left edge is
  // 3 px beside the first one's.
  const box = (await page.getByTestId('bed-canvas').boundingBox())!;
  const drag = async (alt: boolean) => {
    await page.mouse.move(box.x + box.width * 0.6125, box.y + box.height * 0.6);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2125 + 3, box.y + box.height * 0.6, { steps: 10 });
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };
  await drag(true);
  expect(Math.abs((await num(page, 'sel-x')) - left)).toBeGreaterThan(0.1);
  await page.keyboard.press('ControlOrMeta+z');
  await drag(false);
  expect(await num(page, 'sel-x')).toBeCloseTo(left, 1);
});
