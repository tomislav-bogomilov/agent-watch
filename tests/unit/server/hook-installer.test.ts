import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installGateHook, isGateHookInstalled } from '../../../server/hook-installer';

let dir: string;
let settingsPath: string;
const OPTS = () => ({ settingsPath, scriptPath: 'C:/tg/hooks/thoughtgraph-gate.mjs', port: 5173 });

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-installer-'));
  settingsPath = path.join(dir, 'settings.json');
});

afterAll(async () => { /* temp dirs cleaned by OS; nothing shared to remove */ });

describe('installGateHook', () => {
  it('creates settings.json when absent (no backup needed)', async () => {
    const res = await installGateHook(OPTS());
    expect(res.status).toBe('installed');
    expect(res.backupPath).toBeNull();
    const written = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const entry = written.hooks.PreToolUse[0];
    expect(entry.matcher).toBe('*');
    expect(entry.hooks[0].command).toContain('thoughtgraph-gate.mjs');
    expect(entry.hooks[0].command).toContain('--port 5173');
    expect(entry.hooks[0].timeout).toBe(14400);
  });

  it('preserves every existing key, hook, and entry', async () => {
    const existing = {
      model: 'claude-fable-5',
      permissions: { allow: ['Bash(npm test)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo stop' }] }],
      },
    };
    await fs.writeFile(settingsPath, JSON.stringify(existing), 'utf8');
    await installGateHook(OPTS());
    const written = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    expect(written.model).toBe('claude-fable-5');
    expect(written.permissions).toEqual(existing.permissions);
    expect(written.hooks.Stop).toEqual(existing.hooks.Stop);
    expect(written.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(written.hooks.PreToolUse).toHaveLength(2);
  });

  it('writes a backup of the original before modifying', async () => {
    const original = JSON.stringify({ hooks: {} });
    await fs.writeFile(settingsPath, original, 'utf8');
    const res = await installGateHook(OPTS());
    expect(res.backupPath).toBeTruthy();
    expect(await fs.readFile(res.backupPath!, 'utf8')).toBe(original);
  });

  it('is idempotent — second call reports already-installed and writes nothing', async () => {
    await installGateHook(OPTS());
    const after1 = await fs.readFile(settingsPath, 'utf8');
    const res = await installGateHook(OPTS());
    expect(res.status).toBe('already-installed');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(after1);
  });

  it('refuses to touch a file it cannot parse', async () => {
    await fs.writeFile(settingsPath, '{ not json', 'utf8');
    await expect(installGateHook(OPTS())).rejects.toMatchObject({ code: 'EBADSETTINGS' });
    expect(await fs.readFile(settingsPath, 'utf8')).toBe('{ not json');
  });
});

describe('isGateHookInstalled', () => {
  it('false for missing or unrelated settings, true after install', async () => {
    expect(await isGateHookInstalled(settingsPath)).toBe(false);
    await fs.writeFile(settingsPath, JSON.stringify({ hooks: { PreToolUse: [] } }), 'utf8');
    expect(await isGateHookInstalled(settingsPath)).toBe(false);
    await installGateHook(OPTS());
    expect(await isGateHookInstalled(settingsPath)).toBe(true);
  });
});
