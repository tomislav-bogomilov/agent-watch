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

function withRecordTimestamps(jsonl: string, timestamp: string): string {
  const records = jsonl.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
  const latestTimestampMs = Math.max(...records.map((record) => Date.parse(record.timestamp)));
  const activityTimestampMs = Date.parse(timestamp);
  return records.map((record) => JSON.stringify({
    ...record,
    timestamp: new Date(activityTimestampMs - (latestTimestampMs - Date.parse(record.timestamp))).toISOString(),
  })).join('\n') + '\n';
}

test.setTimeout(150_000);

test('Codex Live refreshes nested read-only panes and can return to replay', async ({ page }) => {
  const originals = await Promise.all(rollouts.map(async (file) => ({
    file,
    text: await readFile(file, 'utf8'),
    stats: await stat(file),
  })));
  const controlRequests: string[] = [];
  let failNextCodexPayload = false;
  let staleMtimeStep = 0;

  async function writeRolloutActivity(file: string, jsonl: string, timestamp: string): Promise<void> {
    await writeFile(file, withRecordTimestamps(jsonl, timestamp), 'utf8');
    const staleMtime = new Date(Date.now() - 90_000 - ++staleMtimeStep * 1_000);
    await utimes(file, staleMtime, staleMtime);
  }

  async function appendRolloutActivity(file: string, text: string): Promise<void> {
    await appendFile(file, text);
    const staleMtime = new Date(Date.now() - 90_000 - ++staleMtimeStep * 1_000);
    await utimes(file, staleMtime, staleMtime);
  }

  page.on('request', (request) => {
    if (request.url().includes('/api/control/')) controlRequests.push(request.url());
  });
  await page.route('**/api/sessions/codex/**', async (route) => {
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
    await Promise.all([
      writeRolloutActivity(mainRollout, originals[0].text, now.toISOString()),
      writeRolloutActivity(childRollout, originals[1].text, now.toISOString()),
    ]);

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
      writeRolloutActivity(grandchildRollout, grandchildJsonl, new Date().toISOString()),
      writeRolloutActivity(guardianRollout, guardianJsonl, new Date().toISOString()),
    ]);
    await expect(page.getByText('Auditor', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('guardian', { exact: true })).toBeVisible({ timeout: 30_000 });
    const mainDetail = page.getByTestId('live-pane-detail').first();
    await expect(mainDetail.locator('div').filter({ hasText: /^Codex live complete$/ })).toBeVisible();
    await expect(mainDetail.locator('pre').filter({ hasText: /^Codex live complete$/ })).toBeVisible();

    const failedRefresh = page.waitForResponse((response) => (
      response.url().includes('/api/sessions/codex/') && response.status() === 500
    ));
    failNextCodexPayload = true;
    await failedRefresh;
    await expect(page.getByTestId('live-panes-grid')).toBeVisible();
    await expect(mainDetail.locator('div').filter({ hasText: /^Codex live complete$/ })).toBeVisible();
    await expect(mainDetail.locator('pre').filter({ hasText: /^Codex live complete$/ })).toBeVisible();
    await expect(page.getByText('Scout', { exact: true })).toBeVisible();
    await expect(page.getByText('Auditor', { exact: true })).toBeVisible();
    await expect(page.getByText('guardian', { exact: true })).toBeVisible();

    await appendRolloutActivity(mainRollout, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Live refresh arrived' }],
      },
    })}\n`);
    await expect(mainDetail.locator('div').filter({ hasText: /^Live refresh arrived$/ })).toBeVisible({ timeout: 20_000 });
    await expect(mainDetail.locator('pre').filter({ hasText: /^Live refresh arrived$/ })).toBeVisible();

    const staleActivity = new Date(Date.now() - 45_000);
    await writeRolloutActivity(childRollout, originals[1].text, staleActivity.toISOString());
    const scoutPane = page.getByTestId('live-pane').filter({
      has: page.getByText('Scout', { exact: true }),
    });
    await expect(scoutPane.getByTestId('countdown-chip')).toBeVisible({ timeout: 20_000 });
    await appendRolloutActivity(childRollout, `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Scout resumed' }],
      },
    })}\n`);
    await expect(scoutPane.getByTestId('countdown-chip')).toHaveCount(0, { timeout: 20_000 });
    await expect(scoutPane).toBeVisible();

    const guardianStaleActivity = new Date(Date.now() - 45_000);
    await writeRolloutActivity(guardianRollout, guardianJsonl, guardianStaleActivity.toISOString());
    const guardianPane = page.getByTestId('live-pane').filter({
      has: page.getByText('guardian', { exact: true }),
    });
    await expect(guardianPane.getByTestId('countdown-chip')).toBeVisible({ timeout: 20_000 });
    await writeRolloutActivity(grandchildRollout, grandchildJsonl, new Date().toISOString());
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
