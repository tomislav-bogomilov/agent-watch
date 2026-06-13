import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findToolUseOwner } from '../../../server/correlate-tool-use';

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-correlate-'));
  const projectDir = path.join(root, 'C--proj');
  const subDir = path.join(projectDir, 'sess-1', 'subagents');
  await fs.mkdir(subDir, { recursive: true });
  const mainLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_main_1', name: 'Bash', input: { command: 'ls' } }] },
  });
  const agentLine = JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_agent_1', name: 'Read', input: { file_path: 'x' } }] },
  });
  await fs.writeFile(path.join(projectDir, 'sess-1.jsonl'), mainLine + '\n', 'utf8');
  await fs.writeFile(path.join(subDir, 'agent-0.jsonl'), agentLine + '\n', 'utf8');
});

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('findToolUseOwner', () => {
  it('finds a tool_use in the main transcript', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_main_1')).resolves.toBe('main');
  });

  it('finds a tool_use in a subagent transcript and returns the agent file id', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_agent_1')).resolves.toBe('agent-0');
  });

  it('returns null for an id present nowhere', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'toolu_nope')).resolves.toBeNull();
  });

  it('returns null (not a crash) for a session with no transcript', async () => {
    await expect(findToolUseOwner(root, 'C--proj', 'missing', 'toolu_main_1')).resolves.toBeNull();
  });

  it('rejects ids/paths that escape the root', async () => {
    await expect(findToolUseOwner(root, '..', 'sess-1', 'toolu_main_1')).rejects.toThrow(/escapes root/);
    await expect(findToolUseOwner(root, 'C--proj', 'sess-1', 'x"} bad')).resolves.toBeNull();
  });
});
