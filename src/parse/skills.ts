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

// A hook (e.g. SessionStart) can inject a skill's full body straight into
// context — the superpowers bootstrap skill is the canonical case. That body
// IS loaded (and costs tokens), even though it was never invoked via the Skill
// tool. The injection names the skill via a marker; if absent we fall back to
// the skill's markdown frontmatter. Returns the skill name, or null when the
// hook content is not a skill body (so unrelated hook context is ignored).
function hookSkillName(content: string): string | null {
  const marker = content.match(/your '([^']+)' skill/);
  if (marker) return marker[1];
  const name = content.match(/^name:\s*(.+)$/m);
  const hasDescription = /^description:\s*.+$/m.test(content);
  if (name && hasDescription) return name[1].trim();
  return null;
}

function tokensFromChars(len: number): number {
  return Math.ceil(len / 4);
}

export function extractSkillTrack(events: RawEvent[]): SkillTrack {
  const collected: SkillActivation[] = [];
  let availableCount = 0;

  for (const ev of events) {
    // Invoked skills — explicit Skill tool calls.
    if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      for (const block of ev.message!.content as RawContentBlock[]) {
        if (block.type !== 'tool_use' || block.name !== 'Skill') continue;
        const skill = (block.input as { skill?: string } | undefined)?.skill;
        if (!skill || typeof skill !== 'string') continue;
        const resultText = findToolResultText(events, block.id);
        const fromResultText = tokensFromChars(resultText?.length ?? 0);
        const cacheCreate = cacheCreationOf(ev);
        const tokenCost = fromResultText >= SHORT_RESULT_THRESHOLD
          ? fromResultText
          : (cacheCreate > 0 ? cacheCreate : fromResultText);
        collected.push({ name: skill, activatedAt: ev.timestamp, byTurnId: ev.uuid, tokenCost, source: 'invoked' });
      }
    }

    // Hook-injected skill bodies, and the available-skills listing.
    const attachment = ev.attachment;
    if (!attachment) continue;
    if (attachment.type === 'hook_additional_context') {
      // Real transcripts deliver hook content as a string[]; older/other shapes
      // use a plain string. Normalize to one string before matching.
      const content = Array.isArray(attachment.content)
        ? attachment.content.join('\n')
        : (attachment.content ?? '');
      const name = content ? hookSkillName(content) : null;
      if (name) {
        collected.push({
          name,
          activatedAt: ev.timestamp,
          byTurnId: ev.uuid,
          tokenCost: tokensFromChars(content.length),
          source: 'hook',
          hookEvent: attachment.hookName,
        });
      }
    } else if (attachment.type === 'skill_listing') {
      const count = typeof attachment.skillCount === 'number'
        ? attachment.skillCount
        : (Array.isArray(attachment.names) ? attachment.names.length : 0);
      availableCount = Math.max(availableCount, count);
    }
  }

  // A skill can be both hook-injected at start and invoked later; that's one
  // skill in context, so dedupe by name keeping the earliest load.
  const byName = new Map<string, SkillActivation>();
  for (const a of collected) {
    const prev = byName.get(a.name);
    if (!prev || a.activatedAt < prev.activatedAt) byName.set(a.name, a);
  }

  return { activations: [...byName.values()], availableCount };
}

export function skillsActiveAt(milestone: Milestone, track: SkillTrack): SkillActivation[] {
  return track.activations
    .filter((a) => a.activatedAt <= milestone.timestamp)
    .sort((a, b) => b.tokenCost - a.tokenCost);
}
