// tests/e2e/memory-page.spec.ts
import { expect, test } from '@playwright/test';

test('memory page: browse, connections, graph, stats', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tab-memory').click();

  await expect(page.getByTestId('memory-page')).toBeVisible();
  // Memory now opens on GRAPH tab, switch to DETAIL for this test
  await page.getByTestId('memory-view-detail').click();
  // Sidebar lists fixture memories grouped under the project.
  await page.getByTestId('memory-item-C--demo-mem-alpha-note').click();

  // Detail shows body + connections.
  await expect(page.getByTestId('memory-detail')).toBeVisible();
  await expect(page.getByTestId('conn-out-beta-note')).toBeVisible();
  await expect(page.getByTestId('conn-session')).toBeVisible();

  // Navigate via connection pill.
  await page.getByTestId('conn-out-beta-note').click();
  await expect(page.getByText('Beta body.')).toBeVisible();

  // Graph view renders nodes + an edge.
  await page.getByTestId('memory-view-graph').click();
  await expect(page.getByTestId('graph-node-alpha-note')).toBeVisible();
  await expect(page.getByTestId('graph-node-beta-note')).toBeVisible();

  // Stats view renders the composition total.
  await page.getByTestId('memory-view-stats').click();
  await expect(page.getByTestId('stats-total')).toContainText('memories');
});

test('memory page: jump to origin session switches to sessions mode', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tab-memory').click();
  // Memory now opens on GRAPH tab, switch to DETAIL for this test
  await page.getByTestId('memory-view-detail').click();
  await page.getByTestId('memory-item-C--demo-mem-alpha-note').click();
  await page.getByTestId('conn-session').click();
  await expect(page.getByTestId('mode-tab-sessions')).toHaveAttribute('aria-selected', 'true');
});
