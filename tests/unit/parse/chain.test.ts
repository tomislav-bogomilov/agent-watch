import { describe, it, expect } from 'vitest';
import { buildChain } from '../../../src/parse/chain';
import type { RawEvent } from '../../../src/parse/types';

function evt(uuid: string, parentUuid: string | null): RawEvent {
  return { uuid, parentUuid, timestamp: '2026-05-21T00:00:00Z', type: 'user' };
}

describe('buildChain', () => {
  it('orders events by parent pointer regardless of input order', () => {
    const events = [evt('c', 'b'), evt('a', null), evt('b', 'a')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['a', 'b', 'c']);
  });

  it('returns a single root event correctly', () => {
    const events = [evt('only', null)];
    expect(buildChain(events).map((e) => e.uuid)).toEqual(['only']);
  });

  it('drops orphaned events (parent not present)', () => {
    const events = [evt('a', null), evt('b', 'a'), evt('orphan', 'missing')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty input', () => {
    expect(buildChain([])).toEqual([]);
  });

  it('uses the first event without a parent as root if multiple roots exist', () => {
    const events = [evt('r1', null), evt('r2', null), evt('a', 'r1')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['r1', 'a']);
  });
});
