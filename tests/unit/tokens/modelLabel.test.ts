import { describe, it, expect } from 'vitest';
import { modelLabel } from '../../../src/tokens/modelLabel';

describe('modelLabel', () => {
  it('claude-opus-4-7 → Opus 4.7', () => {
    expect(modelLabel('claude-opus-4-7')).toBe('Opus 4.7');
  });
  it('claude-sonnet-4-6 → Sonnet 4.6', () => {
    expect(modelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6');
  });
  it('claude-haiku-4-5-20251001 → Haiku 4.5', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
  });
  it('something-weird → something-weird', () => {
    expect(modelLabel('something-weird')).toBe('something-weird');
  });
  it('empty string → empty string', () => {
    expect(modelLabel('')).toBe('');
  });
});
