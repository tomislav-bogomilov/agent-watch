import { describe, it, expect } from 'vitest';
import { subagentLabel } from '../../../src/components/live/subagentLabel';

describe('subagentLabel', () => {
  it('strips the agent- prefix and truncates to 8 characters', () => {
    expect(subagentLabel('agent-a0c55d88c829c7399')).toBe('SUBAGENT a0c55d88');
  });

  it('handles ids without the agent- prefix', () => {
    expect(subagentLabel('4e2af9zzzz')).toBe('SUBAGENT 4e2af9zz');
  });

  it('handles ids shorter than 8 chars without throwing', () => {
    expect(subagentLabel('agent-abc')).toBe('SUBAGENT abc');
  });
});
