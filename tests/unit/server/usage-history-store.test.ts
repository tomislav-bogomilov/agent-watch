import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emptyHistory, mergeHistory, readHistory, writeHistory, rowKey,
  type UsageHistory,
} from '../../../server/usage-history-store';
import type { TokenUsageRow } from '../../../server/aggregate-token-usage';

function row(over: Partial<TokenUsageRow>): TokenUsageRow {
  return {
    projectId: 'P', modelId: 'claude-opus-4-8', isSubagent: false, day: '2026-06-01',
    input: 10, output: 20, cacheRead: 30, cacheWrite5m: 40, cacheWrite1h: 50,
    ...over,
  };
}

describe('mergeHistory', () => {
  it('takes per-field max when a key exists in both (current-day growth)', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ input: 10, output: 5 })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ input: 25, output: 5 })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].input).toBe(25);
    expect(merged.rows[0].output).toBe(5);
  });

  it('keeps the larger history value when logs have partially eroded', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ input: 100, cacheRead: 900 })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ input: 40, cacheRead: 200 })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows[0].input).toBe(100);
    expect(merged.rows[0].cacheRead).toBe(900);
  });

  it('unions disjoint keys (history-only rows survive)', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ day: '2026-01-01' })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ day: '2026-06-01' })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(2);
  });

  it('treats projectId/modelId/isSubagent/day as the identity key', () => {
    const hist: UsageHistory = { ...emptyHistory(), rows: [row({ isSubagent: false })] };
    const merged = mergeHistory(hist, { projects: [], rows: [row({ isSubagent: true })] }, '2026-06-06T00:00:00Z');
    expect(merged.rows).toHaveLength(2);
    expect(rowKey(merged.rows[0])).not.toBe(rowKey(merged.rows[1]));
  });

  it('merges the projects map (fresh cwd wins, history-only ids survive)', () => {
    const hist: UsageHistory = { ...emptyHistory(), projects: { OLD: 'C:/old', P: 'C:/stale' } };
    const merged = mergeHistory(hist, { projects: [{ id: 'P', cwd: 'C:/fresh' }], rows: [] }, '2026-06-06T00:00:00Z');
    expect(merged.projects).toEqual({ OLD: 'C:/old', P: 'C:/fresh' });
  });

  it('stamps lastSyncAt', () => {
    const merged = mergeHistory(emptyHistory(), { projects: [], rows: [] }, '2026-06-06T12:00:00Z');
    expect(merged.lastSyncAt).toBe('2026-06-06T12:00:00Z');
  });
});

describe('readHistory / writeHistory', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-usage-'));
  });

  it('returns empty history when the directory or file does not exist', async () => {
    expect(await readHistory(path.join(dir, 'nope'))).toEqual(emptyHistory());
  });

  it('round-trips write → read', async () => {
    const h: UsageHistory = { ...emptyHistory(), lastSyncAt: 'X', rows: [row({})] };
    await writeHistory(dir, h);
    expect(await readHistory(dir)).toEqual(h);
  });

  it('writes a .bak of the previous version on overwrite', async () => {
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v1' });
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v2' });
    const bak = JSON.parse(await fs.readFile(path.join(dir, 'usage-history.json.bak'), 'utf8'));
    expect(bak.lastSyncAt).toBe('v1');
  });

  it('recovers from a corrupt live file via the backup, quarantining the bad file', async () => {
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v1' });
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v2' });
    await fs.writeFile(path.join(dir, 'usage-history.json'), '{not json', 'utf8');
    const recovered = await readHistory(dir);
    expect(recovered.lastSyncAt).toBe('v1'); // .bak holds v1 (pre-v2 copy)
    const names = await fs.readdir(dir);
    expect(names.some((n) => n.startsWith('usage-history.corrupt-'))).toBe(true);
  });

  it('treats valid-JSON-but-wrong-shape live files as corrupt (recovers from backup)', async () => {
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v1' });
    await writeHistory(dir, { ...emptyHistory(), lastSyncAt: 'v2' });
    await fs.writeFile(path.join(dir, 'usage-history.json'), JSON.stringify({ version: 0 }), 'utf8');
    const recovered = await readHistory(dir);
    expect(recovered.lastSyncAt).toBe('v1');
    const names = await fs.readdir(dir);
    expect(names.some((n) => n.startsWith('usage-history.corrupt-'))).toBe(true);
  });

  it('falls back to empty history when live and backup are both unusable', async () => {
    await fs.writeFile(path.join(dir, 'usage-history.json'), '{not json', 'utf8');
    expect(await readHistory(dir)).toEqual(emptyHistory());
  });

  it('discards a history written under an older schema version (forces a clean rebuild)', async () => {
    // A pre-fix file recorded inflated per-row maxes under schema v1. Because
    // mergeHistory keeps the per-field max, those stale highs would otherwise
    // mask a corrected (lower) aggregation forever. A schema bump must drop them.
    await fs.writeFile(
      path.join(dir, 'usage-history.json'),
      JSON.stringify({ version: 1, lastSyncAt: 'old', projects: { P: 'C:/p' }, rows: [row({ input: 999999 })] }),
      'utf8',
    );
    const h = await readHistory(dir);
    expect(h.rows).toEqual([]); // stale inflated rows are not loaded
  });
});
