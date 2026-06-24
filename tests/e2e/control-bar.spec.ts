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

  test('bar renders, expands, and the gate round-trips steer-with-note (allow+context) then allow', async ({ page, request }) => {
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

    // 4. Gate again → the waiting 'all' note is delivered ONCE as allow+context.
    //    allow (not deny) so the agent CONTINUES, with the note as guidance.
    const steerRes = await request.post('/api/control/gate', { data: gateBody });
    expect(steerRes.ok()).toBeTruthy();
    const steer = await steerRes.json();
    expect(steer.action).toBe('allow');
    expect(steer.context).toContain('use the fixtures dir');

    // 5. Gate once more → note consumed, nothing paused → plain allow (no context).
    const allowRes = await request.post('/api/control/gate', { data: gateBody });
    expect(allowRes.ok()).toBeTruthy();
    expect(await allowRes.json()).toEqual({ action: 'allow' });
  });

  // Regression: in LIVE the inspector dock (right panel) is an overlay over the
  // whole frame, while the control bar is anchored to the bottom with z-index:30.
  // The dock used to span the full height and run BEHIND the bar, hiding the
  // bottom of the (e.g. Logical Steps) content. LivePanes now measures the bar
  // and the dock reserves that space, so the dock stops above the bar — even
  // when the bar EXPANDS (taller) to show per-agent rows.
  test('inspector dock stops above the control bar (collapsed and expanded)', async ({ page }) => {
    const now = new Date();
    await utimes(FIXTURE, now, now);
    await page.goto('/');
    await page.locator(`[data-testid="session-item-${SESSION_ID}"]`).click();
    await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });

    const dock = page.locator('[data-testid="inspector-tabs"]');
    await expect(dock).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="control-bar"]')).toBeVisible({ timeout: 15_000 });

    // dock.bottom must sit at/above bar.top (ResizeObserver → state → re-render
    // is async, so poll). Also assert the bar has real height (it's measured).
    const clearance = () => page.evaluate(() => {
      const d = document.querySelector('[data-testid="inspector-tabs"]').getBoundingClientRect();
      const b = document.querySelector('[data-testid="control-bar"]').getBoundingClientRect();
      return { overhang: Math.round(d.bottom - b.top), barH: Math.round(b.height) };
    });

    await expect.poll(async () => (await clearance()).overhang, { timeout: 8_000 }).toBeLessThanOrEqual(1);
    expect((await clearance()).barH).toBeGreaterThan(0);

    // Expand the bar (per-agent rows → taller, its top moves up). The dock must
    // re-reserve and still clear it.
    await page.locator('[data-testid="control-bar-toggle"]').click();
    await expect(page.locator('[data-testid="control-row-main"]')).toBeVisible();
    await expect.poll(async () => (await clearance()).overhang, { timeout: 8_000 }).toBeLessThanOrEqual(1);
  });

  // Regression: the control bar shares the LIVE layout with the per-pane detail
  // panel, which carries z-index:4 and — when a node's detail content is tall —
  // overflows the (overflow:visible) panes grid down over the bar. With no
  // stacking context the bar lost the hit-test, so pause/resume clicks landed on
  // the detail panel and silently did nothing ("no change when paused"). The bar
  // must keep its controls clickable underneath such an overlay.
  test('control bar controls stay click-reachable under a z-index:4 pane overlay', async ({ page }) => {
    const now = new Date();
    await utimes(FIXTURE, now, now);
    await page.goto('/');
    await page.locator(`[data-testid="session-item-${SESSION_ID}"]`).click();
    await expect(page.locator('[data-testid="live-panes-grid"]')).toBeVisible({ timeout: 15_000 });

    const bar = page.locator('[data-testid="control-bar"]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="control-bar-toggle"]').click(); // expand → action row visible

    // The bar must establish a stacking context (positioned + numeric z-index)
    // so it paints above the z-index:4 detail panel.
    const stacking = await bar.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, zIndex: Number(cs.zIndex) };
    });
    expect(stacking.position).not.toBe('static');
    expect(stacking.zIndex).toBeGreaterThan(4);

    // Reproduce the real overlap: a grid-child overlay at z-index:4 covering a
    // bar button, then assert hit-testing still resolves to the button.
    const reachable = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="live-panes-grid"]') as HTMLElement;
      const btn = document.querySelector('[data-testid="control-bar-toggle"]') as HTMLElement;
      const br = btn.getBoundingClientRect();
      const gr = grid.getBoundingClientRect();
      const ov = document.createElement('div');
      ov.style.position = 'absolute';
      ov.style.left = `${br.left - gr.left}px`;
      ov.style.top = `${br.top - gr.top}px`;
      ov.style.width = `${br.width}px`;
      ov.style.height = `${br.height}px`;
      ov.style.zIndex = '4'; // same layer as the per-pane detail panel
      grid.appendChild(ov);
      const hit = document.elementFromPoint(Math.round(br.left + br.width / 2), Math.round(br.top + br.height / 2));
      ov.remove();
      return !!(hit && btn.contains(hit));
    });
    expect(reachable).toBe(true);
  });
});
