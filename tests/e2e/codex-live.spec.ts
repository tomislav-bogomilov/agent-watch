import { expect, test } from '@playwright/test';
import { appendFile, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../fixtures/codex-home/sessions/2026/08/09');
const rollouts = ['rollout-live-main.jsonl', 'rollout-live-child.jsonl']
  .map((name) => path.join(fixtureDir, name));
const mainRollout = rollouts[0];
const childRollout = rollouts[1];
const grandchildRollout = path.join(fixtureDir, 'rollout-live-grandchild.jsonl');
const guardianRollout = path.join(fixtureDir, 'rollout-live-guardian.jsonl');

const grandchildJsonl = [
  { timestamp: '2026-08-09T08:00:05.100Z', type: 'session_meta', payload: { id: 'codex-live-grandchild', parent_thread_id: 'codex-live-child', cwd: 'C:/demo/codex-live', thread_source: 'subagent', agent_path: 'reviewer', agent_nickname: 'Auditor' } },
  { timestamp: '2026-08-09T08:00:05.200Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Review live behavior' }] } },
  { timestamp: '2026-08-09T08:00:08.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Live review complete' }] } },
].map((record) => JSON.stringify(record)).join('\n') + '\n';

const guardianJsonl = [
  { timestamp: '2026-08-09T08:00:08.100Z', type: 'session_meta', payload: { id: 'codex-live-guardian', parent_thread_id: 'codex-live-main', cwd: 'C:/demo/codex-live', thread_source: 'subagent', agent_path: 'guardian' } },
  { timestamp: '2026-08-09T08:00:08.200Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Guard the live result' }] } },
  { timestamp: '2026-08-09T08:00:09.800Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Live guard complete' }] } },
].map((record) => JSON.stringify(record)).join('\n') + '\n';

test.setTimeout(150_000);

test('Codex Live refreshes nested read-only panes and can return to replay', async ({ page }) => {
  const originals = await Promise.all(rollouts.map(async (file) => ({
    file,
    text: await readFile(file, 'utf8'),
    stats: await stat(file),
  })));
  const controlRequests: string[] = [];
  const codexPayloadRequests: string[] = [];
  let failNextCodexPayload = false;

  page.on('request', (request) => {
    if (request.url().includes('/api/control/')) controlRequests.push(request.url());
  });
  await page.route('**/api/sessions/codex/**', async (route) => {
    codexPayloadRequests.push(route.request().url());
    if (failNextCodexPayload) {
      failNextCodexPayload = false;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"temporary"}' });
      return;
    }
    await route.continue();
  });

  try {
    const now = new Date();
    await Promise.all([
      rm(grandchildRollout, { force: true }),
      rm(guardianRollout, { force: true }),
    ]);
    await Promise.all([mainRollout, childRollout].map((file) => utimes(file, now, now)));

    await page.goto('/');
    const group = page.locator('[data-project-key="demo/codex-live"]');
    const codexRow = group.locator('li').filter({ hasText: 'CODEX' });
    await expect(codexRow.getByTestId('live-tag')).toBeVisible({ timeout: 15_000 });
    await codexRow.click();

    await expect(page.getByTestId('live-panes-grid')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('live-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('control-bar')).toHaveCount(0);
    await expect(page.getByTestId('pane-tab-narrative')).toHaveCount(0);
    await expect(page.getByText('Scout', { exact: true })).toBeVisible();
    await expect(page.getByText('Auditor', { exact: true })).toHaveCount(0);
    await expect(page.getByText('guardian', { exact: true })).toHaveCount(0);

    await Promise.all([
      writeFile(grandchildRollout, grandchildJsonl, 'utf8'),
      writeFile(guardianRollout, guardianJsonl, 'utf8'),
    ]);
    const childCreatedAt = new Date();
    await Promise.all([
      utimes(grandchildRollout, childCreatedAt, childCreatedAt),
      utimes(guardianRollout, childCreatedAt, childCreatedAt),
    ]);
    await expect(page.getByText('Auditor', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('guardian', { exact: true })).toBeVisible({ timeout: 30_000 });
    const mainDetail = page.getByTestId('live-pane-detail').first();
    await expect(mainDetail.getByText('Codex live complete', { exact: true })).toBeVisible();

    const beforeFailure = codexPayloadRequests.length;
    failNextCodexPayload = true;
    await expect.poll(() => codexPayloadRequests.length, { timeout: 20_000 }).toBeGreaterThan(beforeFailure);
    await expect(page.getByTestId('live-panes-grid')).toBeVisible();
    await expect(mainDetail.getByText('Codex live complete', { exact: true })).toBeVisible();
    await expect(page.getByText('Scout', { exact: true })).toBeVisible();
    await expect(page.getByText('Auditor', { exact: true })).toBeVisible();
    await expect(page.getByText('guardian', { exact: true })).toBeVisible();

    await appendFile(mainRollout, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Live refresh arrived' }],
      },
    })}\n`);
    await expect(mainDetail.getByText('Live refresh arrived', { exact: true })).toBeVisible({ timeout: 20_000 });

    const stale = new Date(Date.now() - 45_000);
    await utimes(childRollout, stale, stale);
    const scoutPane = page.getByTestId('live-pane').filter({
      has: page.getByText('Scout', { exact: true }),
    });
    await expect(scoutPane.getByTestId('countdown-chip')).toBeVisible({ timeout: 20_000 });
    const reactivated = new Date();
    await utimes(childRollout, reactivated, reactivated);
    await expect(scoutPane.getByTestId('countdown-chip')).toHaveCount(0, { timeout: 20_000 });
    await expect(scoutPane).toBeVisible();

    const nestedFreshAt = new Date();
    await utimes(grandchildRollout, nestedFreshAt, nestedFreshAt);
    const guardianStale = new Date(Date.now() - 45_000);
    await utimes(guardianRollout, guardianStale, guardianStale);
    const guardianPane = page.getByTestId('live-pane').filter({
      has: page.getByText('guardian', { exact: true }),
    });
    await expect(guardianPane.getByTestId('countdown-chip')).toBeVisible({ timeout: 20_000 });
    const nestedActiveDuringRemoval = new Date();
    await utimes(grandchildRollout, nestedActiveDuringRemoval, nestedActiveDuringRemoval);
    await expect(guardianPane).toHaveCount(0, { timeout: 40_000 });
    await expect(page.getByText('Auditor', { exact: true })).toBeVisible();

    await page.getByTestId('live-button').click();
    await expect(page.getByTestId('live-panes-grid')).toHaveCount(0);
    await expect(page.getByTestId('step-forward')).toBeVisible();
    expect(controlRequests).toEqual([]);
  } finally {
    await Promise.all(originals.map(async ({ file, text, stats }) => {
      await writeFile(file, text, 'utf8');
      await utimes(file, stats.atime, stats.mtime);
    }));
    await Promise.all([
      rm(grandchildRollout, { force: true }),
      rm(guardianRollout, { force: true }),
    ]);
  }
});
