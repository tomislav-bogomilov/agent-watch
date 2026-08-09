import { describe, expect, it } from 'vitest';
import { createProviderRegistry } from '../../../server/providers/registry';
import type { SessionProviderAdapter } from '../../../server/providers/types';

function adapter(
  id: 'claude' | 'codex',
  startedAt: string,
  lastUpdatedAt = startedAt,
  onRead?: () => void,
): SessionProviderAdapter {
  return {
    id,
    async listSessions() {
      return {
        sessions: [{
          provider: id, projectId: `${id}-p`, sessionId: `${id}-s`, cwd: `/${id}`,
          startedAt, lastUpdatedAt, sizeBytes: 1,
        }],
        warnings: [],
      };
    },
    async readSession(projectId, sessionId) {
      onRead?.();
      return {
        provider: id,
        projectId,
        sessionId,
        cwd: `/${id}`,
        jsonl: '',
        subagents: [],
      } as Awaited<ReturnType<SessionProviderAdapter['readSession']>>;
    },
  };
}

describe('provider registry', () => {
  it('merges successful providers newest-first', async () => {
    const registry = createProviderRegistry([
      adapter('claude', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
      adapter('codex', '2026-02-02T00:00:00Z', '2026-02-01T00:00:00Z'),
    ]);

    const result = await registry.listSessions();

    expect(result.sessions.map((s) => s.provider)).toEqual(['claude', 'codex']);
    expect(result.warnings).toEqual([]);
  });

  it('keeps healthy sessions when one provider rejects', async () => {
    const broken = adapter('codex', '2026-02-01T00:00:00Z');
    broken.listSessions = async () => { throw new Error('access denied'); };
    const registry = createProviderRegistry([adapter('claude', '2026-01-01T00:00:00Z'), broken]);

    const result = await registry.listSessions();

    expect(result.sessions.map((s) => s.provider)).toEqual(['claude']);
    expect(result.warnings).toEqual([{ provider: 'codex', message: 'access denied' }]);
  });

  it('routes reads only to the requested provider', async () => {
    let claudeReads = 0;
    let codexReads = 0;
    const registry = createProviderRegistry([
      adapter('claude', '2026-01-01T00:00:00Z', undefined, () => { claudeReads += 1; }),
      adapter('codex', '2026-02-01T00:00:00Z', undefined, () => { codexReads += 1; }),
    ]);

    const payload = await registry.readSession('codex', 'p', 's');

    expect(payload.provider).toBe('codex');
    expect(claudeReads).toBe(0);
    expect(codexReads).toBe(1);
  });
});
