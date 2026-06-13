import { expect, test } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Scratch settings file the control plugin's installer/state targets via
// TG_CLAUDE_SETTINGS (set in playwright.config.ts). Never the real ~/.claude.
const SETTINGS = path.resolve(__dirname, '../../.local/e2e-claude-settings.json');

// The LIVE fixture the e2e webServer serves (CLAUDE_HOME points at this dir).
// Same fixture live-session-tag.spec.ts uses; the dir name is the projectId and
// the .jsonl basename is the sessionId for the control API.
const FIXTURE = path.resolve(__dirname, '../fixtures/claude-projects/C--demo-live/2026-05-24-live-fixture.jsonl');
const PROJECT_ID = 'C--demo-live';
const SESSION_ID = '2026-05-24-live-fixture';

// The gate hook command path (with the gate marker) the installer would write.
// We pre-seed an equivalent "installed" entry so the UI pause buttons enable and
// /state reports installed:true without depending on the install button.
const GATE_SETTINGS = {
  hooks: {
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'node "x/thoughtgraph-gate.mjs" --port 5174', timeout: 14400 }],
      },
    ],
  },
};

test.describe('LIVE control bar', () => {
  test.beforeAll(async () => {
    await fs.mkdir(path.dirname(SETTINGS), { recursive: true });
    await fs.writeFile(SETTINGS, JSON.stringify(GATE_SETTINGS, null, 2), 'utf8');
  });

  test('bar renders, expands, and the gate round-trips deny-with-note then allow', async ({ page, request }) => {
    // --- PART A: UI render --------------------------------------------------
    // Make the fixture "live" (fresh mtime) and open it exactly like
    // live-session-tag.spec.ts; LIVE auto-engages and renders the multi-pane grid.
    const now = new Date();
    await utimes(FIXTURE, now, now);

    await page.goto('/');
    await page.locator(`[data-testid="session-item-${SESSION_ID}"]`).click();

    await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="live-button"]')).toHaveAttribute('aria-pressed', 'true');

    // The control bar lives at the bottom of the LIVE layout.
    const bar = page.locator('[data-testid="control-bar"]');
    await expect(bar).toBeVisible({ timeout: 15_000 });

    // Collapsed by default: per-agent rows are not rendered until toggled.
    await expect(page.locator('[data-testid="control-row-main"]')).toHaveCount(0);

    // Expand → the MAIN row renders and becomes visible.
    await page.locator('[data-testid="control-bar-toggle"]').click();
    await expect(page.locator('[data-testid="control-row-main"]')).toBeVisible();

    // --- PART B: deterministic gate round-trip via the API ------------------
    // Does not depend on a real agent or transcript correlation. 'toolu_e2e'
    // never correlates → owner 'unknown', so only a pause-all (or an 'all' note)
    // affects it — exactly the contract we exercise below.
    const gateBody = {
      session_id: SESSION_ID,
      tool_use_id: 'toolu_e2e',
      tool_name: 'Bash',
      tool_input: {},
    };

    // 1. Pause ALL — registers projectId for this session and freezes everything.
    const pauseRes = await request.post('/api/control/pause', {
      data: { projectId: PROJECT_ID, sessionId: SESSION_ID, target: 'all' },
    });
    expect(pauseRes.ok()).toBeTruthy();

    // 2. Gate while pause-all is active → held, then 'poll' after holdMs.
    //    pause-all holds even the uncorrelatable 'unknown' owner.
    const heldRes = await request.post('/api/control/gate', {
      data: { ...gateBody, holdMs: 100 },
    });
    expect(heldRes.ok()).toBeTruthy();
    expect(await heldRes.json()).toEqual({ action: 'poll' });

    // 3. Resume ALL with a steer note. Clears the pause and leaves an 'all' note.
    const resumeRes = await request.post('/api/control/resume', {
      data: { projectId: PROJECT_ID, sessionId: SESSION_ID, target: 'all', note: 'use the fixtures dir' },
    });
    expect(resumeRes.ok()).toBeTruthy();

    // 4. Gate again → the waiting 'all' note is delivered as a one-shot deny.
    const denyRes = await request.post('/api/control/gate', { data: gateBody });
    expect(denyRes.ok()).toBeTruthy();
    const deny = await denyRes.json();
    expect(deny.action).toBe('deny');
    expect(deny.reason).toContain('use the fixtures dir');

    // 5. Gate once more → note consumed, nothing paused → allow.
    const allowRes = await request.post('/api/control/gate', { data: gateBody });
    expect(allowRes.ok()).toBeTruthy();
    expect(await allowRes.json()).toEqual({ action: 'allow' });
  });
});
