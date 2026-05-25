import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateTokenUsage } from '../../../server/aggregate-token-usage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures', 'tokens-root');

describe('aggregateTokenUsage', () => {
  it('returns empty payload when root does not exist', async () => {
    const out = await aggregateTokenUsage(path.join(FIXTURE_ROOT, 'does-not-exist'));
    expect(out).toEqual({ projects: [], rows: [] });
  });

  it('lists every project directory under root, even if empty of usage rows', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const ids = out.projects.map((p) => p.id).sort();
    expect(ids).toEqual(['C--demo-a', 'C--demo-b']);
  });

  it('decodes project ids into cwds', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const a = out.projects.find((p) => p.id === 'C--demo-a')!;
    expect(a.cwd).toBe('C:/demo/a');
  });

  it('groups main-session rows by (projectId, modelId, isSubagent, day)', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const aMain = out.rows.filter(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.modelId === 'claude-opus-4-7' && r.day === '2026-05-20'
    );
    expect(aMain).toHaveLength(1);
    expect(aMain[0]).toEqual({
      projectId: 'C--demo-a',
      modelId: 'claude-opus-4-7',
      isSubagent: false,
      day: '2026-05-20',
      input: 110,
      output: 55,
      cached: 500,
    });
  });

  it('sums cache_read + cache_creation into a single cached bucket', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.day === '2026-05-20'
    )!;
    expect(row.cached).toBe(500); // 200 read + 300 creation
  });

  it('marks subagent file rows with isSubagent=true', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const sub = out.rows.find((r) => r.projectId === 'C--demo-a' && r.isSubagent);
    expect(sub).toBeDefined();
    expect(sub!.modelId).toBe('claude-opus-4-7');
    expect(sub!.day).toBe('2026-05-21');
  });

  it('skips assistant events missing model or usage', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const bMain = out.rows.filter((r) => r.projectId === 'C--demo-a' && r.modelId === 'claude-sonnet-4-6');
    expect(bMain).toHaveLength(1);
    expect(bMain[0].input).toBe(7);
  });

  it('skips lines that are not valid JSON without throwing', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const b = out.rows.filter((r) => r.projectId === 'C--demo-b');
    expect(b).toHaveLength(1);
    expect(b[0].modelId).toBe('claude-haiku-4-5-20251001');
    expect(b[0].input).toBe(1);
  });

  it('skips events with empty timestamps', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const b = out.rows.filter((r) => r.projectId === 'C--demo-b' && r.input === 99);
    expect(b).toHaveLength(0);
  });
});
