import { describe, expect, it } from 'vitest';
import {
  associateSubagentFiles,
  liveSubagentKey,
  liveSubagentLabel,
} from '../../../src/components/live/subagentAssociation';

const entries = [
  { key: 'spawn:second', spawnThreadId: 'thread-b', spawnLabel: '→ Auditor' },
  { key: 'spawn:first', spawnThreadId: 'thread-a', spawnLabel: '→ Scout' },
];

describe('associateSubagentFiles', () => {
  it('preserves Claude alphabetical positional pairing', () => {
    const result = associateSubagentFiles('claude', entries, {
      'agent-bbbb': 'b',
      'agent-aaaa': 'a',
    });
    expect([...result.entries()]).toEqual([
      ['spawn:second', 'agent-aaaa'],
      ['spawn:first', 'agent-bbbb'],
    ]);
  });

  it('matches Codex entries directly by spawn thread id regardless of order', () => {
    const result = associateSubagentFiles('codex', entries, {
      'thread-a': 'a',
      'thread-b': 'b',
    });
    expect(result.get('spawn:second')).toBe('thread-b');
    expect(result.get('spawn:first')).toBe('thread-a');
  });

  it('does not invent a Codex mapping for a missing rollout', () => {
    const result = associateSubagentFiles('codex', entries, { 'thread-a': 'a' });
    expect(result.has('spawn:second')).toBe(false);
  });
});

describe('liveSubagentLabel', () => {
  it('keeps the existing Claude file-id label', () => {
    expect(liveSubagentLabel('claude', 'agent-aaaa1111', '→ ignored')).toBe('SUBAGENT aaaa1111');
  });

  it('uses the Codex nickname or path embedded in the normalized spawn label', () => {
    expect(liveSubagentLabel('codex', 'thread-b', '→ Auditor')).toBe('Auditor');
  });

  it('falls back to a short thread label when the Codex spawn label is empty', () => {
    expect(liveSubagentLabel('codex', 'thread-b', '')).toBe('SUBAGENT thread-b');
  });
});

describe('liveSubagentKey', () => {
  it('keeps Codex pane identity stable when a synthetic spawn ordinal changes', () => {
    expect(liveSubagentKey('codex', {
      id: 'main:2:subagent_spawn',
      spawnThreadId: 'guardian-thread',
    })).toBe('spawn:guardian-thread');
    expect(liveSubagentKey('codex', {
      id: 'main:3:subagent_spawn',
      spawnThreadId: 'guardian-thread',
    })).toBe('spawn:guardian-thread');
  });

  it('preserves Claude spawn-milestone identity', () => {
    expect(liveSubagentKey('claude', {
      id: 'spawn-agent-aaaa',
      spawnThreadId: 'unused',
    })).toBe('spawn:spawn-agent-aaaa');
  });
});
