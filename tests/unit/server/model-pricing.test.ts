import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUNDLED_PRICES, ensureMonthSnapshot, loadPriceSnapshots,
} from '../../../server/model-pricing';

describe('BUNDLED_PRICES', () => {
  it('derives cache prices from the input price (0.1x read, 1.25x 5m write, 2x 1h write)', () => {
    for (const [model, p] of Object.entries(BUNDLED_PRICES.perMTok)) {
      expect(p.cacheRead, model).toBeCloseTo(p.input * 0.1, 10);
      expect(p.cacheWrite5m, model).toBeCloseTo(p.input * 1.25, 10);
      expect(p.cacheWrite1h, model).toBeCloseTo(p.input * 2, 10);
    }
  });

  it('covers the models seen in real logs', () => {
    for (const id of ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
      expect(BUNDLED_PRICES.perMTok[id], id).toBeDefined();
    }
  });
});

describe('ensureMonthSnapshot / loadPriceSnapshots', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-prices-'));
  });

  it('creates prices/YYYY-MM.json from the bundled table', async () => {
    await ensureMonthSnapshot(dir, '2026-06');
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'prices', '2026-06.json'), 'utf8'));
    expect(parsed.month).toBe('2026-06');
    expect(parsed.perMTok['claude-opus-4-8'].input).toBe(BUNDLED_PRICES.perMTok['claude-opus-4-8'].input);
  });

  it('never overwrites an existing snapshot (user edits are preserved)', async () => {
    const file = path.join(dir, 'prices', '2026-06.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ month: '2026-06', currency: 'USD', source: 'hand-edit', perMTok: {} }), 'utf8');
    await ensureMonthSnapshot(dir, '2026-06');
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(parsed.source).toBe('hand-edit');
  });

  it('loads every month snapshot keyed by filename month', async () => {
    await ensureMonthSnapshot(dir, '2026-05');
    await ensureMonthSnapshot(dir, '2026-06');
    const snaps = await loadPriceSnapshots(dir);
    expect(Object.keys(snaps).sort()).toEqual(['2026-05', '2026-06']);
  });

  it('skips unparseable snapshots and non-month files', async () => {
    await ensureMonthSnapshot(dir, '2026-06');
    await fs.writeFile(path.join(dir, 'prices', '2026-07.json'), '{broken', 'utf8');
    await fs.writeFile(path.join(dir, 'prices', 'notes.txt'), 'hi', 'utf8');
    const snaps = await loadPriceSnapshots(dir);
    expect(Object.keys(snaps)).toEqual(['2026-06']);
  });

  it('returns {} when the prices directory does not exist', async () => {
    expect(await loadPriceSnapshots(path.join(dir, 'nope'))).toEqual({});
  });
});
