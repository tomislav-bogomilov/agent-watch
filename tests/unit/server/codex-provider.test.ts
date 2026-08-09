import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codexSessionsRoot } from '../../../server/plugin-shared';
import { codexProjectId, createCodexSessionAdapter } from '../../../server/providers/codex';

const temporaryRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claudewatch-codex-'));
  temporaryRoots.push(root);
  return root;
}

async function rollout(root: string, relativePath: string, records: unknown[]): Promise<string> {
  const file = path.join(root, relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join('\n'));
  return file;
}

function meta(id: string, cwd: string, extra: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-08-08T08:00:00.000Z',
    type: 'session_meta',
    payload: { id, cwd, ...extra },
  };
}

function assistant(text = 'done') {
  return {
    timestamp: '2026-08-08T08:01:00.000Z',
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Codex session provider', () => {
  it('uses CODEX_HOME/sessions and defaults to ~/.codex/sessions', () => {
    expect(codexSessionsRoot('D:/custom-codex')).toBe(path.join('D:/custom-codex', 'sessions'));
    expect(codexSessionsRoot()).toBe(path.join(os.homedir(), '.codex', 'sessions'));
  });

  it('recursively discovers renderable main rollouts and excludes child rollouts', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    const main = await rollout(root, '2026/08/08/rollout-main.jsonl', [meta('main-thread', cwd), assistant()]);
    await rollout(root, '2026/08/08/rollout-child.jsonl', [
      meta('child-thread', cwd, {
        parent_thread_id: 'main-thread',
        thread_source: 'subagent',
        agent_path: 'researcher',
        agent_nickname: 'Scout',
      }),
      assistant('child result'),
    ]);
    await rollout(root, '2026/08/08/rollout-empty.jsonl', [meta('empty-thread', cwd)]);
    await rollout(root, '2026/08/08/rollout-bad.jsonl', [{ nope: true }]);

    const adapter = createCodexSessionAdapter(root);
    const result = await adapter.listSessions();

    expect(result.warnings).toEqual([]);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      provider: 'codex',
      projectId: codexProjectId(cwd),
      sessionId: 'main-thread',
      cwd,
      title: 'done',
    });

    const payload = await adapter.readSession(result.sessions[0].projectId, 'main-thread');
    expect(payload.provider).toBe('codex');
    if (payload.provider !== 'codex') throw new Error('expected Codex payload');
    expect(payload.jsonl).toContain('main-thread');
    expect(payload.subagents).toEqual([
      expect.objectContaining({
        threadId: 'child-thread',
        parentThreadId: 'main-thread',
        agentPath: 'researcher',
        agentNickname: 'Scout',
      }),
    ]);
    expect(await fs.readFile(main, 'utf8')).toContain('main-thread');
  });

  it('sorts newest first and skips malformed individual rollout lines', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    const older = await rollout(root, '2026/08/07/rollout-old.jsonl', [meta('old', cwd), assistant('old')]);
    const newer = await rollout(root, '2026/08/08/rollout-new.jsonl', [
      meta('new', cwd),
      assistant('new'),
    ]);
    await fs.appendFile(newer, '\nnot-json');
    const oldTime = new Date('2026-08-07T00:00:00.000Z');
    const newTime = new Date('2026-08-08T00:00:00.000Z');
    await fs.utimes(older, oldTime, oldTime);
    await fs.utimes(newer, newTime, newTime);

    const result = await createCodexSessionAdapter(root).listSessions();
    expect(result.sessions.map((session) => session.sessionId)).toEqual(['new', 'old']);
  });

  it('lists reasoning-summary sessions but never promotes subagent metadata to a main session', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    await rollout(root, '2026/08/08/rollout-reasoning.jsonl', [
      meta('reasoning-only', cwd),
      { timestamp: '2026-08-08T08:01:00.000Z', type: 'response_item', payload: {
        type: 'reasoning', summary: [{ type: 'summary_text', text: 'A visible fallback' }],
      } },
    ]);
    await rollout(root, '2026/08/08/rollout-orphan-subagent.jsonl', [
      meta('orphan-child', cwd, { thread_source: 'subagent' }),
      assistant('must not become a main session'),
    ]);

    const result = await createCodexSessionAdapter(root).listSessions();
    expect(result.sessions.map((session) => session.sessionId)).toEqual(['reasoning-only']);
  });

  it('prefers the first real user message for the session title', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    await rollout(root, '2026/08/08/rollout-title.jsonl', [
      meta('title-thread', cwd),
      assistant('assistant preface'),
      { timestamp: '2026-08-08T08:02:00.000Z', type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>x</environment_context>Actual task' }],
      } },
    ]);
    const result = await createCodexSessionAdapter(root).listSessions();
    expect(result.sessions[0].title).toBe('Actual task');
  });

  it('treats a missing root as normal and an unreadable root as a warning', async () => {
    const missing = path.join(await tempRoot(), 'missing');
    expect(await createCodexSessionAdapter(missing).listSessions()).toEqual({ sessions: [], warnings: [] });

    const adapter = createCodexSessionAdapter(missing, {
      readDirectory: async () => { throw Object.assign(new Error('access denied'), { code: 'EACCES' }); },
    });
    expect(await adapter.listSessions()).toEqual({
      sessions: [],
      warnings: [{ provider: 'codex', message: expect.stringContaining('access denied') }],
    });
  });

  it('keeps healthy sessions when a nested directory is unreadable', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    await rollout(root, 'good/rollout-main.jsonl', [meta('main-thread', cwd), assistant()]);
    await fs.mkdir(path.join(root, 'blocked'));

    const adapter = createCodexSessionAdapter(root, {
      readDirectory: async (directory) => {
        if (directory === path.join(root, 'blocked')) {
          throw Object.assign(new Error('nested access denied'), { code: 'EACCES' });
        }
        return fs.readdir(directory);
      },
    });
    const result = await adapter.listSessions();

    expect(result.sessions.map((session) => session.sessionId)).toEqual(['main-thread']);
    expect(result.warnings).toEqual([
      { provider: 'codex', message: expect.stringContaining('nested access denied') },
    ]);
  });

  it('reuses cached metadata scans and reads JSONL on demand', async () => {
    const root = await tempRoot();
    const cwd = path.resolve('D:/projects/example');
    await rollout(root, 'rollout-main.jsonl', [meta('main-thread', cwd), assistant()]);
    let reads = 0;
    const adapter = createCodexSessionAdapter(root, {
      readFile: async (filePath) => {
        reads += 1;
        return fs.readFile(filePath, 'utf8');
      },
    });

    const first = await adapter.listSessions();
    await adapter.listSessions();
    expect(reads).toBe(1);

    await adapter.readSession(first.sessions[0].projectId, first.sessions[0].sessionId);
    expect(reads).toBe(2);
  });

  it('resolves request ids only through its discovered index', async () => {
    const root = await tempRoot();
    const outsideRoot = await tempRoot();
    const outside = await rollout(outsideRoot, 'rollout-secret.jsonl', [
      meta('secret', 'D:/secret'), assistant('secret'),
    ]);
    const adapter = createCodexSessionAdapter(root);
    await adapter.listSessions();

    await expect(adapter.readSession('..', path.basename(outside))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
