import { expect, test } from '@playwright/test';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('live tag: card shows [● LIVE] for a session with a recent mtime', async ({ page }) => {
  // Touch the fixture so its mtime is now (the e2e webServer is using
  // tests/fixtures/claude-projects as CLAUDE_HOME).
  const fixture = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
  const now = new Date();
  await utimes(fixture, now, now);

  await page.goto('/');
  // Expand the demo-live project (it auto-expands when first encountered) and
  // confirm the LIVE tag is visible on the live fixture's card.
  const card = page.locator('[data-testid="session-item-2026-05-24-live-fixture"]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('[data-testid="live-tag"]')).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('[data-testid="live-tag"]')).toHaveText(/LIVE/);
});

test('live mode: auto-engages when opening a live session, renders multi-pane', async ({ page }) => {
  const fixture = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
  const now = new Date();
  await utimes(fixture, now, now);

  await page.goto('/');
  await page.locator('[data-testid="session-item-2026-05-24-live-fixture"]').click();

  // Multi-pane grid should appear; LIVE button should show aria-pressed=true.
  await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="live-button"]')).toHaveAttribute('aria-pressed', 'true');
});
