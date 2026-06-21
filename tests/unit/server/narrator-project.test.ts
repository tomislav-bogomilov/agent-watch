import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isNarratorProject, narratorCwd } from '../../../server/plugin-shared';
import { listSessions } from '../../../server/vite-plugin-sessions';

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

describe('listSessions excludes narrator projects', () => {
  it('does not surface the narrator fixture project', async () => {
    const root = path.resolve(__dirname, '../../fixtures/claude-projects');
    const sessions = await listSessions(root);
    expect(sessions.some((s) => isNarratorProject(s.projectId))).toBe(false);
  });
});
