import { describe, it, expect } from 'vitest';
import { narrativePollInterval } from '../../../src/api/hooks';
import { POLL_MS } from '../../../src/components/live/liveness';
import type { NarrativeState } from '../../../src/narrative/types';

const state = (building: boolean): NarrativeState => ({
  blocks: [],
  building,
  error: null,
  model: 'haiku',
  generatedAt: building ? null : '2026-06-22T00:00:00Z',
});

describe('narrativePollInterval', () => {
  it('LIVE sessions always poll, building or not', () => {
    expect(narrativePollInterval(true, undefined)).toBe(POLL_MS);
    expect(narrativePollInterval(true, state(false))).toBe(POLL_MS);
    expect(narrativePollInterval(true, state(true))).toBe(POLL_MS);
  });

  it('playback polls while a build is in flight (so the loader resolves)', () => {
    expect(narrativePollInterval(false, state(true))).toBe(POLL_MS);
  });

  it('playback stops polling once the build is done or has not started', () => {
    expect(narrativePollInterval(false, state(false))).toBe(false);
    expect(narrativePollInterval(false, undefined)).toBe(false);
  });
});
