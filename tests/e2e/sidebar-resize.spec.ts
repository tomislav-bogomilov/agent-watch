import { expect, test } from '@playwright/test';

test('sidebar drag-handle resizes width and persists across reload', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByTestId('session-list');
  await expect(sidebar).toBeVisible();
  const before = await sidebar.boundingBox();
  if (!before) throw new Error('no sidebar bbox');
  const handle = page.getByTestId('sidebar-resize');
  await expect(handle).toBeVisible();
  const hb = await handle.boundingBox();
  if (!hb) throw new Error('no handle bbox');
  // Drag the handle 80 px to the right.
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await sidebar.boundingBox();
  if (!after) throw new Error('no post-drag bbox');
  // Width should have grown by close to the drag distance (within clamp).
  expect(after.width).toBeGreaterThan(before.width + 40);
  // Persistence — reload and check it stayed.
  const persisted = await page.evaluate(() => localStorage.getItem('tg.sidebar.width'));
  expect(persisted).not.toBeNull();
  expect(Number(persisted)).toBeGreaterThan(before.width + 40);
  await page.reload();
  const reloaded = await page.getByTestId('session-list').boundingBox();
  if (!reloaded) throw new Error('no reload bbox');
  expect(Math.round(reloaded.width)).toBe(Math.round(after.width));
});
