import { describe, it, expect } from 'vitest';
import { firstSentence } from '../../../src/parse/sentence';

describe('firstSentence', () => {
  it('returns the first sentence when terminated with a period', () => {
    expect(firstSentence('Hello world. Then more.')).toBe('Hello world');
  });

  it('returns the first sentence when terminated with ! or ?', () => {
    expect(firstSentence('Wow! Next.')).toBe('Wow');
    expect(firstSentence('Why? Because.')).toBe('Why');
  });

  it('returns the entire string trimmed when no terminator', () => {
    expect(firstSentence('  no terminator here  ')).toBe('no terminator here');
  });

  it('truncates to 160 chars when no terminator and string is long', () => {
    const long = 'x'.repeat(200);
    expect(firstSentence(long)).toBe('x'.repeat(160));
  });

  it('returns empty string for empty input', () => {
    expect(firstSentence('')).toBe('');
    expect(firstSentence('   ')).toBe('');
  });

  it('handles a single character followed by terminator', () => {
    expect(firstSentence('a. b. c.')).toBe('a');
  });
});
