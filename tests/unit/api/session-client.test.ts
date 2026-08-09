import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSessionList, fetchSessionPayload } from '../../../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('provider-aware session client', () => {
  it('uses the provider-qualified session endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider: 'codex', projectId: 'p', sessionId: 's', cwd: '/p', jsonl: '', subagents: [] }),
    });
    vi.stubGlobal('fetch', fetch);
    await fetchSessionPayload('codex', 'project/id', 'thread id');
    expect(fetch).toHaveBeenCalledWith('/api/sessions/codex/project%2Fid/thread%20id');
  });

  it('preserves non-blocking provider warnings on the returned list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], warnings: [{ provider: 'codex', message: 'unreadable' }] }),
    }));
    expect(await fetchSessionList()).toEqual({
      sessions: [], warnings: [{ provider: 'codex', message: 'unreadable' }],
    });
  });
});
