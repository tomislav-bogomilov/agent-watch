import { describe, it, expect } from 'vitest';
import { familyOf } from '../../../src/tokens/family';

describe('familyOf', () => {
  it('claude-opus-4-7 → "opus"', () => {
    expect(familyOf('claude-opus-4-7')).toBe('opus');
  });
  it('claude-sonnet-4-6 → "sonnet"', () => {
    expect(familyOf('claude-sonnet-4-6')).toBe('sonnet');
  });
  it('claude-haiku-4-5-20251001 → "haiku"', () => {
    expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku');
  });
  it('case-insensitive match', () => {
    expect(familyOf('Claude-OPUS-4-7')).toBe('opus');
  });
  it('unknown model id → null', () => {
    expect(familyOf('gpt-4o-mini')).toBe(null);
  });
  it('empty string → null', () => {
    expect(familyOf('')).toBe(null);
  });
});
