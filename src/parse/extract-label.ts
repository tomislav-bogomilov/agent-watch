import type { MilestoneKind } from './types';

export type LabelInput =
  | { kind: 'root_prompt' | 'assistant_turn' | 'user_followup' | 'completion' }
  | { kind: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { kind: 'subagent_spawn'; subagentType: string };

function safeBasename(p: unknown): string {
  if (typeof p !== 'string' || p.length === 0) return '?';
  const normalized = p.replace(/\\/g, '/');
  const last = normalized.split('/').filter(Boolean).pop();
  return last ?? '?';
}

export function extractLabel(input: LabelInput): { label: string; kind: MilestoneKind } {
  switch (input.kind) {
    case 'root_prompt':
      return { label: 'Prompt', kind: 'root_prompt' };
    case 'assistant_turn':
      return { label: 'Decided', kind: 'assistant_turn' };
    case 'user_followup':
      return { label: 'User', kind: 'user_followup' };
    case 'completion':
      return { label: 'Done', kind: 'completion' };
    case 'subagent_spawn':
      return { label: `→ ${input.subagentType}`, kind: 'subagent_spawn' };
    case 'tool_call': {
      const t = input.toolName;
      const args = input.input;
      if (t === 'Read') return { label: `Read ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Edit') return { label: `Edit ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Write') return { label: `Write ${safeBasename(args.file_path)}`, kind: 'tool_call' };
      if (t === 'Bash') return { label: 'Bash', kind: 'tool_call' };
      if (t === 'Grep') return { label: 'Grep', kind: 'tool_call' };
      return { label: t, kind: 'tool_call' };
    }
  }
}
