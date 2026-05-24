import { describe, it, expect } from 'vitest';
import { pickVisibleSubagentEntries } from '../../../src/components/live/visibleSubagents';
import { SUBAGENT_STABLE_MS } from '../../../src/components/live/liveness';
import type { PaneState } from '../../../src/components/live/paneStatus';

type Entry = { key: string; spawnId: string; root: { id: string } };

const entry = (key: string): Entry => ({ key, spawnId: key.replace('spawn:', ''), root: { id: 'r' } });

describe('pickVisibleSubagentEntries', () => {
  const now = new Date('2026-05-24T12:00:00Z').getTime();

  it('keeps entries whose paired fileId mtime is within 30s of now', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 5_000).toISOString() };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, {}, now)).toEqual(entries);
  });

  it('drops entries whose paired fileId mtime is older than 30s (and not in lifecycle)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, {}, now)).toEqual([]);
  });

  it('drops entries whose paired fileId is missing from mtimes', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map<string, string>();
    expect(pickVisibleSubagentEntries(entries, keyToFileId, {}, {}, now)).toEqual([]);
  });

  it('keeps stale-mtime entries if their status is closing (lifecycle in flight)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'closing', closingStartedAt: now - 1_000, frozenAt: null, frozenRemainingMs: null },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual(entries);
  });

  it('keeps stale-mtime entries if their status is frozen', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 60_000).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'frozen', closingStartedAt: now - 10_000, frozenAt: now - 5_000, frozenRemainingMs: 15_000 },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual(entries);
  });

  it('drops entries whose mtime is exactly SUBAGENT_STABLE_MS old (strict less-than boundary)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - SUBAGENT_STABLE_MS).toISOString() };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, {}, now)).toEqual([]);
  });

  it('keeps entries with status=active and fresh mtime (explicit active path)', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now - 5_000).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual(entries);
  });

  it('drops entries whose status is closed even with fresh mtime', () => {
    const entries = [entry('spawn:a')];
    const keyToFileId = new Map([['spawn:a', 'agent-aaaa']]);
    const mtimes = { 'agent-aaaa': new Date(now).toISOString() };
    const status: Record<string, PaneState> = {
      'spawn:a': { status: 'closed', closingStartedAt: now - 50_000, frozenAt: null, frozenRemainingMs: null },
    };
    expect(pickVisibleSubagentEntries(entries, keyToFileId, mtimes, status, now)).toEqual([]);
  });
});
