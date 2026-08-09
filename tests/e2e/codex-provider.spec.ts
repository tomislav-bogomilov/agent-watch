import { expect, test } from '@playwright/test';

test('mixed providers share a cwd group and load provider-specific payloads', async ({ page }) => {
  await page.goto('/');
  const group = page.locator('[data-project-key="demo/happy"]');
  await expect(group.locator('li[data-testid^="session-item"]')).toHaveCount(2);
  await expect(group.getByText('CLAUDE', { exact: true })).toBeVisible();
  await expect(group.getByText('CODEX', { exact: true })).toBeVisible();

  const list = await page.evaluate(async () => (await fetch('/api/sessions')).json());
  const codex = list.sessions.find((session: { provider: string; sessionId: string }) => (
    session.provider === 'codex' && session.sessionId === 'codex-main'
  ));
  expect(codex).toBeTruthy();
  const loaded = await page.evaluate(async (session) => {
    const url = `/api/sessions/${session.provider}/${encodeURIComponent(session.projectId)}/${encodeURIComponent(session.sessionId)}`;
    return (await fetch(url)).json();
  }, codex);
  expect(loaded.provider).toBe('codex');
  expect(loaded.subagents).toHaveLength(3);

  await group.getByText('CODEX', { exact: true }).click();
  await expect(page.getByTestId('selected-provider-badge')).toHaveText('CODEX');
  await expect(page.locator('[data-testid="control-bar"]')).toHaveCount(0);

  // This provider/replay spec is independent of fixture mtime. Recent Codex
  // sessions auto-enter Live, so explicitly leave Live before replay checks.
  await expect.poll(async () => (
    await page.getByTestId('live-panes-grid').count()
    + await page.getByTestId('step-forward').count()
  ), { timeout: 15_000 }).toBeGreaterThan(0);
  if (await page.getByTestId('live-panes-grid').count()) {
    await page.getByTestId('live-button').click();
    await expect(page.getByTestId('live-panes-grid')).toHaveCount(0);
  }

  await page.locator('svg g[data-id="codex-main:0:root_prompt"]').click();
  await expect(page.getByTestId('tab-narrative')).toHaveCount(0);

  const activeNode = page.locator('svg g[data-state="active"]');
  await expect(activeNode).toHaveAttribute('data-id', 'codex-main:0:root_prompt');
  await page.getByTestId('step-forward').click();
  await expect(activeNode).toHaveAttribute('data-id', 'codex-main:1:assistant_turn');
  await page.getByTestId('step-forward').click();
  await expect(activeNode).toHaveAttribute('data-id', 'codex-main:2:tool_call');
  await expect(page.locator('[data-testid="subagent-region"]')).toHaveCount(3);

  await group.getByText('CLAUDE', { exact: true }).click();
  await expect(page.getByTestId('selected-provider-badge')).toHaveText('CLAUDE');
  await page.locator('svg g[data-id]').first().click();
  await expect(page.getByTestId('tab-narrative')).toBeVisible();
});
