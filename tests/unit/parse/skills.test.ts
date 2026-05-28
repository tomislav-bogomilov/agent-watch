import { describe, it, expect } from 'vitest';
import { extractSkillTrack, skillsActiveAt } from '../../../src/parse/skills';
import type { RawEvent, Milestone } from '../../../src/parse/types';

function ev(over: Partial<RawEvent>): RawEvent {
  return {
    uuid: 'u',
    parentUuid: null,
    timestamp: '2026-01-01T00:00:00Z',
    type: 'assistant',
    ...over,
  };
}

function ms(over: Partial<Milestone>): Milestone {
  return {
    id: 'm', kind: 'assistant_turn', label: '', summary: '',
    timestamp: '2026-01-01T00:00:00Z', failed: false,
    raw: {}, children: [], ...over,
  } as Milestone;
}

describe('extractSkillTrack', () => {
  it('returns empty activations when no Skill tool_use is present', () => {
    const events: RawEvent[] = [
      ev({ uuid: 'a', type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('captures a Skill activation with name, timestamp, and turn id', () => {
    const events: RawEvent[] = [
      ev({
        uuid: 'turn-1',
        timestamp: '2026-01-01T00:05:00Z',
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }],
        },
      }),
      ev({
        uuid: 'res-1',
        timestamp: '2026-01-01T00:05:01Z',
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'X'.repeat(400) }],
        },
      }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations).toEqual([
      {
        name: 'superpowers:brainstorming',
        activatedAt: '2026-01-01T00:05:00Z',
        byTurnId: 'turn-1',
        tokenCost: 100, // 400 chars / 4
      },
    ]);
  });

  it('captures multiple activations across separate turns', () => {
    const events: RawEvent[] = [
      ev({ uuid: 't1', timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'A' } }] } }),
      ev({ uuid: 'r1', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'XXXX' }] } }),
      ev({ uuid: 't2', timestamp: '2026-01-01T00:02:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Skill', input: { skill: 'B' } }] } }),
      ev({ uuid: 'r2', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'XX' }] } }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations.map((a) => a.name)).toEqual(['A', 'B']);
    expect(track.activations[0].tokenCost).toBe(1);
    expect(track.activations[1].tokenCost).toBe(1);
  });

  it('uses tokenCost of 0 when tool_result is missing', () => {
    const events: RawEvent[] = [
      ev({ uuid: 't', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'orphan', name: 'Skill', input: { skill: 'X' } }] } }),
    ];
    expect(extractSkillTrack(events).activations[0].tokenCost).toBe(0);
  });

  it('ignores non-Skill tool_use blocks', () => {
    const events: RawEvent[] = [
      ev({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { path: '/x' } }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('ignores Skill blocks missing a skill arg', () => {
    const events: RawEvent[] = [
      ev({ message: { role: 'assistant', content: [{ type: 'tool_use', id: 's', name: 'Skill', input: {} }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });
});

describe('skillsActiveAt', () => {
  it('returns only activations at or before the milestone timestamp, sorted by tokenCost desc', () => {
    const track = {
      activations: [
        { name: 'a', activatedAt: '2026-01-01T00:00:00Z', byTurnId: '1', tokenCost: 5 },
        { name: 'b', activatedAt: '2026-01-01T00:05:00Z', byTurnId: '2', tokenCost: 30 },
        { name: 'c', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '3', tokenCost: 10 },
      ],
    };
    const at = ms({ timestamp: '2026-01-01T00:06:00Z' });
    expect(skillsActiveAt(at, track).map((a) => a.name)).toEqual(['b', 'a']);
  });

  it('returns [] when no activations precede the milestone', () => {
    const track = {
      activations: [{ name: 'a', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '1', tokenCost: 5 }],
    };
    const at = ms({ timestamp: '2026-01-01T00:05:00Z' });
    expect(skillsActiveAt(at, track)).toEqual([]);
  });
});
