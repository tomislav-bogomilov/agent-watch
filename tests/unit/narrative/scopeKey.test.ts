import { describe, it, expect } from 'vitest';
import { safePaneId, narrativeScopeId } from '../../../src/narrative/scopeKey';
import { isSafeScopeKey } from '../../../server/plugin-shared';

describe('safePaneId', () => {
  it('leaves an already-safe id unchanged', () => {
    expect(safePaneId('main')).toBe('main');
  });
  it('replaces colon and other unsafe chars with dash', () => {
    expect(safePaneId('spawn:abc')).toBe('spawn-abc');
  });
  it('produces a value that passes the server scope-key validator', () => {
    expect(isSafeScopeKey(safePaneId('spawn:abc'))).toBe(true);
  });
});

describe('narrativeScopeId', () => {
  const sid = '2026-05-24-live-fixture';
  it('suffixes the (sanitized) pane id with the __ delimiter', () => {
    expect(narrativeScopeId(sid, 'main')).toBe(`${sid}__main`);
    expect(narrativeScopeId(sid, 'spawn:abc')).toBe(`${sid}__spawn-abc`);
  });
  it('MAIN scope differs from the bare sessionId and from subagent scopes', () => {
    expect(narrativeScopeId(sid, 'main')).not.toBe(sid);
    expect(narrativeScopeId(sid, 'main')).not.toBe(narrativeScopeId(sid, 'spawn:abc'));
  });
  it('the full scope id passes the server scope-key validator', () => {
    expect(isSafeScopeKey(narrativeScopeId(sid, 'spawn:abc'))).toBe(true);
  });
});
