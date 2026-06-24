import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { isNarratorProject, narratorCwd, isTempProject } from '../../../server/plugin-shared';
import { listSessions, listPrompts } from '../../../server/vite-plugin-sessions';
import { aggregateTokenUsage } from '../../../server/aggregate-token-usage';

describe('isNarratorProject', () => {
  it('matches any projectId containing the narrator segment', () => {
    expect(isNarratorProject('Z--tmp-thoughtgraph-narrator')).toBe(true);
    expect(isNarratorProject('C--Users-me-thoughtgraph-narrator')).toBe(true);
    expect(isNarratorProject('C--Users-me-real-project')).toBe(false);
  });
  it('narratorCwd ends with the narrator segment', () => {
    expect(narratorCwd().replace(/\\/g, '/').endsWith('thoughtgraph-narrator')).toBe(true);
  });
});

describe('isTempProject', () => {
  // Derive the encoded os.tmpdir() prefix the same way the implementation does,
  // so this is portable across machines/OSes.
  const tmpPrefix = os.tmpdir().replace(/[^A-Za-z0-9]/g, '-');
  it('matches projectIds whose cwd is inside the OS temp dir', () => {
    expect(isTempProject(`${tmpPrefix}-tmp-twgLY28xq2`)).toBe(true);
    expect(isTempProject(`${tmpPrefix}-tmp-WXfVD4Ttvc`)).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(isTempProject(`${tmpPrefix.toLowerCase()}-tmp-abc`)).toBe(true);
  });
  it('does not match real project dirs outside temp', () => {
    expect(isTempProject('C--Users-me-work-RealProject')).toBe(false);
    expect(isTempProject('C--Users-me-dev-ThoughtGraph')).toBe(false);
  });
});

describe('listSessions excludes narrator projects', () => {
  it('does not surface the narrator fixture project', async () => {
    const root = path.resolve(__dirname, '../../fixtures/claude-projects');
    const sessions = await listSessions(root);
    expect(sessions.some((s) => isNarratorProject(s.projectId))).toBe(false);
  });
});

describe('listPrompts excludes narrator projects', () => {
  it('does not surface narrator prompts', async () => {
    const root = path.resolve(__dirname, '../../fixtures/claude-projects');
    const prompts = await listPrompts(root);
    expect(prompts.some((p) => isNarratorProject(p.projectId))).toBe(false);
  });
});

describe('aggregateTokenUsage excludes narrator projects', () => {
  it('does not surface the narrator project', async () => {
    const root = path.resolve(__dirname, '../../fixtures/claude-projects');
    const result = await aggregateTokenUsage(root);
    expect(result.projects.some((p) => isNarratorProject(p.id))).toBe(false);
  });
});
