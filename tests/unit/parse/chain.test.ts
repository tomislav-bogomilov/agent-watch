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

  it('includes orphaned events as additional roots in source order', () => {
    // Real-world JSONLs have many disconnected components after noise
    // filtering; an orphan (parent not in the input) is treated as a new
    // root so we don't drop it.
    const events = [evt('a', null), evt('b', 'a'), evt('orphan', 'missing')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['a', 'b', 'orphan']);
  });

  it('returns empty array for empty input', () => {
    expect(buildChain([])).toEqual([]);
  });

  it('walks all roots in source order when multiple roots exist', () => {
    const events = [evt('r1', null), evt('r2', null), evt('a', 'r1')];
    const chain = buildChain(events);
    expect(chain.map((e) => e.uuid)).toEqual(['r1', 'a', 'r2']);
  });
});
