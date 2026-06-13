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

/** Scan all PreToolUse entries for a hook cmd whose command includes GATE_MARKER. */
function findGateCmd(pre: HookEntry[]): HookCmd | null {
  for (const e of pre) {
    for (const h of (e?.hooks ?? [])) {
      if (typeof h?.command === 'string' && h.command.includes(GATE_MARKER)) return h;
    }
  }
  return null;
}

export async function installGateHook(
  opts: { settingsPath: string; scriptPath: string; port: number },
): Promise<InstallResult> {
  const { settingsPath, scriptPath, port } = opts;

  // 1. Read file (ENOENT → raw=null, settings={}).
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

  // 2. Validate shape BEFORE any write.
  if (settings.hooks !== undefined && settings.hooks !== null) {
    if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
      throw Object.assign(
        new Error('hooks is not an object — refusing to modify it'),
        { code: 'EBADSETTINGS' },
      );
    }
  }

  const hooksObj = (settings.hooks ?? {}) as Record<string, unknown>;
  if (hooksObj.PreToolUse !== undefined && hooksObj.PreToolUse !== null) {
    if (!Array.isArray(hooksObj.PreToolUse)) {
      throw Object.assign(
        new Error('hooks.PreToolUse is not an array — refusing to modify it'),
        { code: 'EBADSETTINGS' },
      );
    }
  }

  // 3. Build the desired command/hook object.
  const desiredCommand = `node "${scriptPath}" --port ${port}`;
  const desiredHookCmd: HookCmd = { type: 'command', command: desiredCommand, timeout: GATE_HOOK_TIMEOUT_S };

  // 4. Find any existing gate hook cmd among current PreToolUse entries.
  const existingPre = Array.isArray(hooksObj.PreToolUse) ? (hooksObj.PreToolUse as HookEntry[]) : [];
  const existingGateCmd = findGateCmd(existingPre);

  // 5. Decide whether a write is needed.
  if (
    existingGateCmd !== null &&
    existingGateCmd.command === desiredCommand &&
    existingGateCmd.timeout === GATE_HOOK_TIMEOUT_S
  ) {
    // Exact match — nothing to do.
    return { status: 'already-installed', backupPath: null, settingsPath };
  }

  // We will write. Take the backup first (only if the file already existed).
  let backupPath: string | null = null;
  if (raw !== null) {
    backupPath = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await fs.writeFile(backupPath, raw, 'utf8');
  }

  // Mutate settings — shape has been validated above.
  settings.hooks ??= {};
  const hooks = settings.hooks as Record<string, unknown>;
  hooks.PreToolUse ??= [];
  const pre = hooks.PreToolUse as HookEntry[];

  if (existingGateCmd !== null) {
    // Port-change / update path: mutate in place, no duplicate entry.
    existingGateCmd.command = desiredCommand;
    existingGateCmd.timeout = GATE_HOOK_TIMEOUT_S;
  } else {
    pre.push({ matcher: '*', hooks: [desiredHookCmd] });
  }

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { status: 'installed', backupPath, settingsPath };
}
