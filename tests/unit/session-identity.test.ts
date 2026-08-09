import { describe, expect, it } from 'vitest';
import { sessionKey, sessionTitleKey } from '../../src/session-identity';

describe('provider-qualified session identity', () => {
  it('keeps identical native ids distinct across providers', () => {
    expect(sessionKey({ provider: 'claude', projectId: 'p', sessionId: 's' })).toBe('claude/p/s');
    expect(sessionKey({ provider: 'codex', projectId: 'p', sessionId: 's' })).toBe('codex/p/s');
  });

  it('uses the same stable identity for persisted titles', () => {
    expect(sessionTitleKey({ provider: 'codex', projectId: 'p', sessionId: 's' })).toBe('codex/p/s');
  });
});
