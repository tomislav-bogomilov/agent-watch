import type { Milestone, RawContentBlock, RawEvent, SkillActivation, SkillTrack } from './types';

function findToolResultText(events: RawEvent[], toolUseId: string): string | null {
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
        if (typeof block.content === 'string') return block.content;
        // content can also be a nested array of blocks; concat any text pieces
        let out = '';
        for (const sub of block.content) {
          if ((sub as RawContentBlock).type === 'text') out += (sub as { type: 'text'; text: string }).text;
        }
        return out;
      }
    }
  }
  return null;
}

export function extractSkillTrack(events: RawEvent[]): SkillTrack {
  const activations: SkillActivation[] = [];
  for (const ev of events) {
    if (ev.type !== 'assistant') continue;
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      if (block.name !== 'Skill') continue;
      const skill = (block.input as { skill?: string } | undefined)?.skill;
      if (!skill || typeof skill !== 'string') continue;
      const resultText = findToolResultText(events, block.id);
      const tokenCost = Math.ceil((resultText?.length ?? 0) / 4);
      activations.push({
        name: skill,
        activatedAt: ev.timestamp,
        byTurnId: ev.uuid,
        tokenCost,
      });
    }
  }
  return { activations };
}

export function skillsActiveAt(milestone: Milestone, track: SkillTrack): SkillActivation[] {
  return track.activations
    .filter((a) => a.activatedAt <= milestone.timestamp)
    .sort((a, b) => b.tokenCost - a.tokenCost);
}
