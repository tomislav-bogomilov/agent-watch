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

// A realistic SessionStart-hook injection of the superpowers bootstrap skill:
// the body is loaded into context, naming the skill via the marker AND carrying
// the skill's markdown frontmatter.
function hookSkillContent(qualifiedName: string, bareName: string, pad = 800): string {
  return (
    `<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n` +
    `**Below is the full content of your '${qualifiedName}' skill - your introduction to using skills.**\n\n` +
    `---\nname: ${bareName}\ndescription: Use when starting any conversation.\n---\n\n` +
    'x'.repeat(pad)
  );
}

describe('extractSkillTrack', () => {
  it('returns empty activations when no skill is loaded', () => {
    const events: RawEvent[] = [
      ev({ uuid: 'a', type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('captures a Skill invocation with name, timestamp, turn id, and source', () => {
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
        source: 'invoked',
      },
    ]);
  });

  it('captures multiple invocations across separate turns', () => {
    const events: RawEvent[] = [
      ev({ uuid: 't1', timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'A' } }] } }),
      ev({ uuid: 'r1', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'XXXX' }] } }),
      ev({ uuid: 't2', timestamp: '2026-01-01T00:02:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Skill', input: { skill: 'B' } }] } }),
      ev({ uuid: 'r2', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'XX' }] } }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations.map((a) => a.name)).toEqual(['A', 'B']);
    expect(track.activations.every((a) => a.source === 'invoked')).toBe(true);
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

describe('extractSkillTrack — hook-loaded skills', () => {
  it('counts a SessionStart hook-injected skill body as loaded (source: hook)', () => {
    const events: RawEvent[] = [
      ev({
        uuid: 'hk', timestamp: '2026-01-01T00:00:00Z', type: 'attachment',
        attachment: {
          type: 'hook_additional_context',
          hookName: 'SessionStart',
          content: hookSkillContent('superpowers:using-superpowers', 'using-superpowers'),
        },
      }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations).toHaveLength(1);
    expect(track.activations[0]).toMatchObject({
      name: 'superpowers:using-superpowers',
      activatedAt: '2026-01-01T00:00:00Z',
      byTurnId: 'hk',
      source: 'hook',
      hookEvent: 'SessionStart',
    });
    expect(track.activations[0].tokenCost).toBeGreaterThan(0);
  });

  it('extracts the qualified skill name from the injection marker, not the bare frontmatter name', () => {
    const events: RawEvent[] = [
      ev({
        type: 'attachment',
        attachment: {
          type: 'hook_additional_context', hookName: 'SessionStart',
          content: hookSkillContent('superpowers:using-superpowers', 'using-superpowers'),
        },
      }),
    ];
    expect(extractSkillTrack(events).activations[0].name).toBe('superpowers:using-superpowers');
  });

  it('handles hook content delivered as a string array (real transcript shape)', () => {
    const events: RawEvent[] = [
      ev({
        uuid: 'hk', timestamp: '2026-01-01T00:00:00Z', type: 'attachment',
        attachment: {
          type: 'hook_additional_context', hookName: 'SessionStart',
          content: [hookSkillContent('superpowers:using-superpowers', 'using-superpowers')],
        },
      }),
    ];
    const track = extractSkillTrack(events);
    expect(track.activations).toHaveLength(1);
    expect(track.activations[0].name).toBe('superpowers:using-superpowers');
    expect(track.activations[0].source).toBe('hook');
  });

  it('ignores hook_additional_context that does not carry a skill body', () => {
    const events: RawEvent[] = [
      ev({
        type: 'attachment',
        attachment: {
          type: 'hook_additional_context', hookName: 'SessionStart',
          content: 'Reminder: today is 2026-06-25. No skill here.',
        },
      }),
    ];
    expect(extractSkillTrack(events).activations).toEqual([]);
  });

  it('dedupes a skill loaded by both hook and invocation, keeping the earliest load', () => {
    const events: RawEvent[] = [
      ev({
        uuid: 'hk', timestamp: '2026-01-01T00:00:00Z', type: 'attachment',
        attachment: {
          type: 'hook_additional_context', hookName: 'SessionStart',
          content: hookSkillContent('superpowers:brainstorming', 'brainstorming'),
        },
      }),
      ev({ uuid: 't1', timestamp: '2026-01-01T00:05:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tu', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }] } }),
      ev({ uuid: 'r1', type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu', content: 'Z'.repeat(800) }] } }),
    ];
    const dupes = extractSkillTrack(events).activations.filter((a) => a.name === 'superpowers:brainstorming');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].source).toBe('hook'); // earliest load wins
  });
});

describe('extractSkillTrack — availableCount', () => {
  it('reads the available skill count from the skill_listing attachment', () => {
    const events: RawEvent[] = [
      ev({
        type: 'attachment',
        attachment: { type: 'skill_listing', skillCount: 35, names: Array.from({ length: 35 }, (_, i) => `s${i}`), isInitial: true },
      }),
    ];
    expect(extractSkillTrack(events).availableCount).toBe(35);
  });

  it('falls back to names.length when skillCount is absent', () => {
    const events: RawEvent[] = [
      ev({ type: 'attachment', attachment: { type: 'skill_listing', names: ['a', 'b', 'c'] } }),
    ];
    expect(extractSkillTrack(events).availableCount).toBe(3);
  });

  it('takes the max skillCount across multiple listings', () => {
    const events: RawEvent[] = [
      ev({ type: 'attachment', attachment: { type: 'skill_listing', skillCount: 20 } }),
      ev({ type: 'attachment', attachment: { type: 'skill_listing', skillCount: 35 } }),
    ];
    expect(extractSkillTrack(events).availableCount).toBe(35);
  });

  it('defaults availableCount to 0 when no skill_listing is present', () => {
    expect(extractSkillTrack([]).availableCount).toBe(0);
  });
});

describe('skillsActiveAt', () => {
  it('returns only activations at or before the milestone timestamp, sorted by tokenCost desc', () => {
    const track = {
      availableCount: 0,
      activations: [
        { name: 'a', activatedAt: '2026-01-01T00:00:00Z', byTurnId: '1', tokenCost: 5, source: 'invoked' as const },
        { name: 'b', activatedAt: '2026-01-01T00:05:00Z', byTurnId: '2', tokenCost: 30, source: 'invoked' as const },
        { name: 'c', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '3', tokenCost: 10, source: 'invoked' as const },
      ],
    };
    const at = ms({ timestamp: '2026-01-01T00:06:00Z' });
    expect(skillsActiveAt(at, track).map((a) => a.name)).toEqual(['b', 'a']);
  });

  it('returns [] when no activations precede the milestone', () => {
    const track = {
      availableCount: 0,
      activations: [{ name: 'a', activatedAt: '2026-01-01T00:10:00Z', byTurnId: '1', tokenCost: 5, source: 'invoked' as const }],
    };
    const at = ms({ timestamp: '2026-01-01T00:05:00Z' });
    expect(skillsActiveAt(at, track)).toEqual([]);
  });
});
