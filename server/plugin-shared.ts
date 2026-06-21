import path from 'node:path';
import os from 'node:os';
import type { Connect } from 'vite';

export function claudeHome(): string {
  return process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.claude', 'projects');
}

export function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

export function readBody(req: Parameters<Connect.NextHandleFunction>[0]): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function isSafeId(s: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(s);
}

export function isSafeScopeKey(s: string): boolean {
  return isSafeId(s) && s !== '.' && s !== '..';
}

const NARRATOR_SEGMENT = 'thoughtgraph-narrator';

/** Fixed working dir for `claude -p` narrators; its last path segment is the marker. */
export function narratorCwd(): string {
  return path.join(os.tmpdir(), NARRATOR_SEGMENT);
}

/** A projectId belongs to a narrator session iff it carries the marker segment. */
export function isNarratorProject(projectId: string): boolean {
  return projectId.includes(NARRATOR_SEGMENT);
}

// True iff `target` resolves to a path inside `root` (or root itself).
export function assertInsideRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw Object.assign(new Error('path escapes root'), { code: 'EOUTSIDE_ROOT' });
  }
}
