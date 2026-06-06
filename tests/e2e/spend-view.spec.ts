import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usageDir = path.resolve(__dirname, '../../.local/e2e-usage');

test('spend view: $ figures match fixtures and history persists to disk', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-tab-usage').click();
  await page.getByTestId('tokens-preset-all').click();

  // TOKENS view: cost chip + breakdown on the opus-4-8 row
  await expect(page.getByTestId('model-cost-claude-opus-4-8')).toHaveText('≈ $26.25');
  await expect(page.getByTestId('model-cost-breakdown-claude-opus-4-8'))
    .toContainText('cache w $11.25');

  // SPEND · BARS
  await page.getByTestId('usage-view-spend').click();
  await expect(page.getByTestId('spend-disclaimer')).toBeVisible();
  await expect(page.getByTestId('spend-chip-total')).toContainText('$26.25');
  await expect(page.getByTestId('spend-chip-cachewrite')).toContainText('$11.25');
  await expect(page.locator('svg [data-role="spend-bar"]').first()).toBeVisible();

  // Ledger month row expands to per-model detail
  await page.getByTestId('spend-month-row-2026-05').click();
  await expect(page.getByTestId('spend-month-detail-2026-05-claude-opus-4-8')).toBeVisible();

  // SPEND · MATRIX
  await page.getByTestId('spend-mode-matrix').click();
  await expect(page.getByTestId('spend-cell-claude-opus-4-8-2026-05')).toContainText('$26.25');
  await page.getByTestId('spend-cell-claude-opus-4-8-2026-05').click();
  await expect(page.getByTestId('spend-cell-pin')).toContainText('cache w');

  // History persisted on disk by the server
  const raw = await fs.readFile(path.join(usageDir, 'usage-history.json'), 'utf8');
  const history = JSON.parse(raw) as { rows: Array<{ modelId: string; day: string }> };
  expect(history.rows.some((r) => r.modelId === 'claude-opus-4-8' && r.day === '2026-05-18')).toBe(true);
});
