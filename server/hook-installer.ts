import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const GATE_MARKER = 'thoughtgraph-gate.mjs';
export const GATE_HOOK_TIMEOUT_S = 14_400; // 4h; Claude Code kills the hook (and ALLOWS the call) past this

type HookCmd = { type?: string; command?: string; timeout?: number };
type HookEntry = { matcher?: string; hooks?: HookCmd[] };

export type InstallResult = {
  status: 'installed' | 'already-installed';
  backupPath: string | null;
  settingsPath: string;
};

export function defaultSettingsPath(): string {
  return process.env.TG_CLAUDE_SETTINGS ?? path.join(os.homedir(), '.claude', 'settings.json');
}

function hasGateEntry(settings: unknown): boolean {
  const entries = (settings as { hooks?: { PreToolUse?: HookEntry[] } })?.hooks?.PreToolUse ?? [];
  if (!Array.isArray(entries)) return false;
  return entries.some((e) =>
    (e?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes(GATE_MARKER)));
}

export async function isGateHookInstalled(settingsPath: string): Promise<boolean> {
  try {
    return hasGateEntry(JSON.parse(await fs.readFile(settingsPath, 'utf8')));
  } catch {
    return false;
  }
}

export async function installGateHook(
  opts: { settingsPath: string; scriptPath: string; port: number },
): Promise<InstallResult> {
  const { settingsPath, scriptPath, port } = opts;

  let raw: string | null = null;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  let settings: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // NEVER overwrite a file we can't parse — the user's config is in there.
      throw Object.assign(new Error('settings.json is not valid JSON — refusing to modify it'), { code: 'EBADSETTINGS' });
    }
  }
  if (hasGateEntry(settings)) return { status: 'already-installed', backupPath: null, settingsPath };

  let backupPath: string | null = null;
  if (raw !== null) {
    backupPath = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await fs.writeFile(backupPath, raw, 'utf8');
  }

  const hooks = ((settings.hooks ??= {}) as Record<string, unknown>);
  const pre = ((hooks.PreToolUse ??= []) as HookEntry[]);
  if (!Array.isArray(pre)) {
    throw Object.assign(new Error('hooks.PreToolUse is not an array — refusing to modify it'), { code: 'EBADSETTINGS' });
  }
  pre.push({
    matcher: '*',
    hooks: [{ type: 'command', command: `node "${scriptPath}" --port ${port}`, timeout: GATE_HOOK_TIMEOUT_S }],
  });

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', backupPath, settingsPath };
}
