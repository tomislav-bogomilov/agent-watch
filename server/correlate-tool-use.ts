import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assertInsideRoot } from './plugin-shared';

// Only the tail matters: the tool_use we're correlating was emitted moments ago.
const TAIL_BYTES = 512 * 1024;

async function tailContains(filePath: string, needle: string): Promise<boolean> {
  let handle: import('node:fs').promises.FileHandle | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const buf = Buffer.alloc(Math.min(TAIL_BYTES, stat.size));
    const { bytesRead } = await handle.read(buf, 0, buf.length, start);
    return buf.slice(0, bytesRead).toString('utf8').includes(needle);
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Which agent issued this tool_use? 'main', an agent file id ('agent-0'), or
 * null when the id isn't in any transcript yet (write lag, or foreign session).
 */
export async function findToolUseOwner(
  root: string,
  projectId: string,
  sessionId: string,
  toolUseId: string,
): Promise<'main' | string | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(toolUseId)) return null;
  const projectDir = path.join(root, projectId);
  const mainPath = path.join(projectDir, `${sessionId}.jsonl`);
  const subDir = path.join(projectDir, sessionId, 'subagents');
  assertInsideRoot(root, mainPath);
  assertInsideRoot(root, subDir);

  const needle = `"id":"${toolUseId}"`;
  let subFiles: string[] = [];
  try {
    subFiles = (await fs.readdir(subDir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    // no subagents dir — main-only session
  }
  for (const f of subFiles) {
    if (await tailContains(path.join(subDir, f), needle)) return f.replace(/\.jsonl$/, '');
  }
  if (await tailContains(mainPath, needle)) return 'main';
  return null;
}
