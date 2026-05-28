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

// The Skill tool's tool_result is often just a short acknowledgement (e.g.
// "Skill X loaded") rather than the full skill content. When that happens,
// fall back to the activating turn's cache_creation_input_tokens — an
// over-estimate that shares one number across all skills loaded in the same
// turn, but lands in the right order of magnitude.
const SHORT_RESULT_THRESHOLD = 200;

function cacheCreationOf(ev: RawEvent): number {
  const usage = (ev.message as { usage?: { cache_creation_input_tokens?: number } } | undefined)?.usage;
  return usage?.cache_creation_input_tokens ?? 0;
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
      const fromResultText = Math.ceil((resultText?.length ?? 0) / 4);
      const cacheCreate = cacheCreationOf(ev);
      const tokenCost = fromResultText >= SHORT_RESULT_THRESHOLD
        ? fromResultText
        : (cacheCreate > 0 ? cacheCreate : fromResultText);
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
