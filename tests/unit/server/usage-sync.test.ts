import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncTokenUsage } from '../../../server/usage-sync';

const EVENT = (model: string, input: number) => JSON.stringify({
  uuid: 'x', timestamp: '2026-06-01T10:00:00Z', type: 'assistant',
  message: { role: 'assistant', model, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
});

describe('syncTokenUsage', () => {
  let claudeRoot: string;
  let usageDir: string;

  beforeEach(async () => {
    claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-claude-'));
    usageDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'tg-usage-')), 'usage');
    await fs.mkdir(path.join(claudeRoot, 'C--proj'), { recursive: true });
    await fs.writeFile(path.join(claudeRoot, 'C--proj', 's1.jsonl'), EVENT('claude-opus-4-8', 100), 'utf8');
  });

  it('returns merged rows, persists history, and snapshots the current month', async () => {
    const now = new Date('2026-06-06T12:00:00Z');
    const payload = await syncTokenUsage(claudeRoot, usageDir, now);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].modelId).toBe('claude-opus-4-8');
    expect(payload.projects).toEqual([{ id: 'C--proj', cwd: 'C:/proj' }]);
    expect(payload.bundledPrices.perMTok['claude-opus-4-8']).toBeDefined();
    expect(payload.prices['2026-06']).toBeDefined();
    // persisted on disk
    const onDisk = JSON.parse(await fs.readFile(path.join(usageDir, 'usage-history.json'), 'utf8'));
    expect(onDisk.rows).toHaveLength(1);
  });

  it('retains history rows after the source logs disappear', async () => {
    const now = new Date('2026-06-06T12:00:00Z');
    await syncTokenUsage(claudeRoot, usageDir, now);
    await fs.rm(path.join(claudeRoot, 'C--proj'), { recursive: true, force: true });
    const payload = await syncTokenUsage(claudeRoot, usageDir, now);
    expect(payload.rows).toHaveLength(1); // history kept it
    expect(payload.projects).toEqual([{ id: 'C--proj', cwd: 'C:/proj' }]); // projects map kept it
  });

  it('still serves data with unsyncedWarning when persistence fails', async () => {
    // Make usageDir unusable: create it as a FILE so mkdir/write inside it fails.
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-bad-'));
    const fileAsDir = path.join(parent, 'usage');
    await fs.writeFile(fileAsDir, 'i am a file', 'utf8');
    const payload = await syncTokenUsage(claudeRoot, fileAsDir, new Date('2026-06-06T12:00:00Z'));
    expect(payload.rows).toHaveLength(1);
    expect(payload.unsyncedWarning).toBeDefined();
  });
});
