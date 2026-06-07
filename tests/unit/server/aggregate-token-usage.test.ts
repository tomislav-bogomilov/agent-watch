import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateTokenUsage } from '../../../server/aggregate-token-usage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures', 'tokens-root');
const DEDUP_ROOT = path.resolve(__dirname, 'fixtures', 'tokens-dedup-root');

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
      cacheRead: 200,
      cacheWrite5m: 300,
      cacheWrite1h: 0,
    });
  });

  it('counts legacy cache_creation (no detail object) as 5m writes', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.projectId === 'C--demo-a' && !r.isSubagent && r.day === '2026-05-20'
    )!;
    expect(row.cacheRead).toBe(200);
    expect(row.cacheWrite5m).toBe(300);
    expect(row.cacheWrite1h).toBe(0);
  });

  it('uses the cache_creation detail split when present', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.modelId === 'claude-opus-4-8' && r.day === '2026-05-25'
    )!;
    expect(row.cacheRead).toBe(1000);
    expect(row.cacheWrite5m).toBe(400);   // from detail, not the 700 legacy total
    expect(row.cacheWrite1h).toBe(300);
  });

  it('zero-fills the missing TTL field when the detail object is partial', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    const row = out.rows.find(
      (r) => r.modelId === 'claude-opus-4-8' && r.day === '2026-05-26'
    )!;
    expect(row.cacheWrite5m).toBe(0);     // detail branch taken; 5m absent -> 0, legacy 700 ignored
    expect(row.cacheWrite1h).toBe(300);
  });

  it('skips <synthetic> model events', async () => {
    const out = await aggregateTokenUsage(FIXTURE_ROOT);
    expect(out.rows.some((r) => r.modelId === '<synthetic>')).toBe(false);
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

describe('aggregateTokenUsage — message.id dedup', () => {
  // A single assistant turn with N content blocks is logged as N JSONL lines
  // that each repeat the same turn-level `usage`; resumed sessions re-log the
  // same message in another file. Usage must be counted once per unique
  // message.id, not once per line.
  it('counts a multi-block / re-logged turn (repeated message.id) only once', async () => {
    const out = await aggregateTokenUsage(DEDUP_ROOT);
    const row = out.rows.find(
      (r) =>
        r.projectId === 'C--demo-dup' &&
        !r.isSubagent &&
        r.modelId === 'claude-opus-4-8' &&
        r.day === '2026-06-01'
    );
    expect(row).toBeDefined();
    // msg_A counted once (5/100/1000/50) + msg_B once (2/10/0/0)
    expect(row!.input).toBe(7);
    expect(row!.output).toBe(110);
    expect(row!.cacheRead).toBe(1000);
    expect(row!.cacheWrite5m).toBe(50);
    expect(row!.cacheWrite1h).toBe(0);
  });

  it('still sums lines that have no message.id (dedup must not swallow them)', async () => {
    const out = await aggregateTokenUsage(DEDUP_ROOT);
    const row = out.rows.find(
      (r) => r.projectId === 'C--demo-dup' && r.modelId === 'claude-sonnet-4-6' && r.day === '2026-06-02'
    );
    expect(row).toBeDefined();
    // two id-less assistant lines (3/4 and 5/6) — summed, not deduped
    expect(row!.input).toBe(8);
    expect(row!.output).toBe(10);
  });
});
