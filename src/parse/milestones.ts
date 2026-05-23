import { extractLabel } from './extract-label';
import { extractSummary } from './extract-summary';
import { extractResult } from './extract-result';
import type { ContextUsage, Milestone, RawContentBlock, RawEvent } from './types';

type ToolUseBlock = { id: string; name: string; input: Record<string, unknown> };

function blocks(ev: RawEvent): RawContentBlock[] {
  const c = ev.message?.content;
  if (!c) return [];
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return c;
}

function plainText(ev: RawEvent): string {
  return blocks(ev)
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function toolUses(ev: RawEvent): ToolUseBlock[] {
  return blocks(ev)
    .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

function toolResults(ev: RawEvent): Map<string, { content: string; isError: boolean }> {
  const result = new Map<string, { content: string; isError: boolean }>();
  for (const b of blocks(ev)) {
    if (b.type === 'tool_result') {
      const content = typeof b.content === 'string'
        ? b.content
        : b.content
            .filter((cb): cb is { type: 'text'; text: string } => cb.type === 'text')
            .map((cb) => cb.text)
            .join('');
      result.set(b.tool_use_id, { content, isError: b.is_error === true });
    }
  }
  return result;
}

function extractUsage(ev: RawEvent): { usage: ContextUsage; contextSize: number } | undefined {
  const u = (ev.message as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!u) return undefined;
  const input = Number(u.input_tokens ?? 0);
  const cacheRead = Number(u.cache_read_input_tokens ?? 0);
  const cacheCreation = Number(u.cache_creation_input_tokens ?? 0);
  const output = Number(u.output_tokens ?? 0);
  if (!Number.isFinite(input + cacheRead + cacheCreation + output)) return undefined;
  return {
    usage: { input, cacheRead, cacheCreation, output },
    contextSize: input + cacheRead + cacheCreation,
  };
}

function makeMilestone(partial: Omit<Milestone, 'children'> & { children?: Milestone[] }): Milestone {
  return { ...partial, children: partial.children ?? [] };
}

export function buildMilestones(events: RawEvent[]): Milestone {
  if (events.length === 0) {
    return makeMilestone({
      id: 'empty',
      kind: 'root_prompt',
      label: 'Prompt',
      summary: '(empty session)',
      timestamp: '',
      failed: false,
      raw: null,
    });
  }

  // Collect all tool results across events keyed by tool_use_id
  const allToolResults = new Map<string, { content: string; isError: boolean }>();
  for (const ev of events) {
    if (ev.type !== 'user') continue;
    const rs = toolResults(ev);
    for (const [id, r] of rs) allToolResults.set(id, r);
  }

  // Build a flat list of milestones in order
  const flat: Milestone[] = [];
  let isFirstUser = true;

  for (const ev of events) {
    if (ev.type === 'user' && ev.message) {
      const onlyToolResults = blocks(ev).every((b) => b.type === 'tool_result');
      if (onlyToolResults) continue; // results merged into tool_call below
      const text = typeof ev.message.content === 'string'
        ? ev.message.content
        : plainText(ev);
      if (text.trim().length === 0) continue;
      const isRoot = isFirstUser;
      isFirstUser = false;
      const kind = isRoot ? 'root_prompt' : 'user_followup';
      const { label } = extractLabel({ kind });
      flat.push(
        makeMilestone({
          id: ev.uuid,
          kind,
          label,
          summary: extractSummary({ kind, text }),
          detail: text,
          timestamp: ev.timestamp,
          failed: false,
          raw: ev,
        })
      );
    } else if (ev.type === 'assistant' && ev.message) {
      const text = plainText(ev);
      const tools = toolUses(ev);
      const usageInfo = extractUsage(ev);

      if (text && tools.length === 0) {
        flat.push(
          makeMilestone({
            id: ev.uuid,
            kind: 'assistant_turn',
            label: extractLabel({ kind: 'assistant_turn' }).label,
            summary: extractSummary({ kind: 'assistant_turn', text }),
            detail: text,
            timestamp: ev.timestamp,
            failed: false,
            raw: ev,
            usage: usageInfo?.usage,
            contextSize: usageInfo?.contextSize,
          })
        );
      }
      for (const tu of tools) {
        const isTask = tu.name === 'Task' || tu.name === 'Agent';
        const kind = isTask ? 'subagent_spawn' : 'tool_call';
        const result = allToolResults.get(tu.id);
        const failed = result?.isError === true || isBashFailed(tu.name, result?.content ?? '');
        const labelInfo = isTask
          ? extractLabel({ kind: 'subagent_spawn', subagentType: String(tu.input.subagent_type ?? '?') })
          : extractLabel({ kind: 'tool_call', toolName: tu.name, input: tu.input });
        const summary = isTask
          ? extractSummary({ kind: 'subagent_spawn', description: String(tu.input.description ?? '') })
          : extractSummary({ kind: 'tool_call', toolName: tu.name, input: tu.input });
        const resultStr = result
          ? extractResult({ toolName: tu.name, isError: result.isError, content: result.content })
          : undefined;
        flat.push(
          makeMilestone({
            id: `${ev.uuid}#${tu.id}`,
            kind,
            label: labelInfo.label,
            summary,
            result: resultStr,
            detail: JSON.stringify(tu.input, null, 2),
            timestamp: ev.timestamp,
            failed,
            toolName: tu.name,
            raw: { event: ev, toolUse: tu, toolResult: result },
            usage: usageInfo?.usage,
            contextSize: usageInfo?.contextSize,
          })
        );
      }
    }
  }

  // Promote final assistant_turn to completion
  for (let i = flat.length - 1; i >= 0; i--) {
    if (flat[i].kind === 'assistant_turn') {
      flat[i] = { ...flat[i], kind: 'completion', label: 'Done' };
      break;
    }
  }

  // Chain flat list into a tree (one child per parent for sequential flow)
  if (flat.length === 0) {
    return makeMilestone({
      id: 'empty',
      kind: 'root_prompt',
      label: 'Prompt',
      summary: '(no milestones)',
      timestamp: events[0]?.timestamp ?? '',
      failed: false,
      raw: null,
    });
  }

  for (let i = flat.length - 1; i > 0; i--) {
    flat[i - 1].children = [flat[i]];
  }
  return flat[0];
}

function isBashFailed(toolName: string, content: string): boolean {
  if (toolName !== 'Bash') return false;
  const m = content.match(/<exit_code>(\d+)<\/exit_code>/);
  if (!m) return false;
  return Number(m[1]) !== 0;
}
