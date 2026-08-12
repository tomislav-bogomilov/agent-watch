import { firstSentence } from './sentence';

export type SummaryInput =
  | { kind: 'root_prompt' | 'user_followup'; text: string }
  | { kind: 'assistant_turn' | 'completion'; text: string }
  | { kind: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { kind: 'subagent_spawn'; description: string };

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function firstLine(s: string): string {
  const lines = s.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function firstQuestion(args: Record<string, unknown>): string {
  const [question] = Array.isArray(args.questions) ? args.questions : [];
  if (typeof question !== 'object' || question === null || Array.isArray(question)) return '';
  return stringValue((question as Record<string, unknown>).question);
}

export function extractSummary(input: SummaryInput): string {
  switch (input.kind) {
    case 'root_prompt':
    case 'user_followup':
      return truncate(input.text.trim(), 160);
    case 'assistant_turn':
    case 'completion':
      return firstSentence(input.text);
    case 'subagent_spawn':
      return truncate(input.description.trim(), 160);
    case 'tool_call': {
      const t = input.toolName;
      const args = input.input;
      if (t === 'Read') return `Read ${args.file_path ?? '?'}`;
      if (t === 'Bash') return `Bash: ${truncate(firstLine(String(args.command ?? '')), 160)}`;
      if (t === 'Edit')
        return `Edit ${args.file_path ?? '?'}`;
      if (t === 'Write') return `Write ${args.file_path ?? '?'}`;
      if (t === 'Grep')
        return `Grep '${args.pattern ?? ''}' in ${args.path ?? '<repo>'}`;
      if (t === 'exec') return `Execute: ${truncate(firstLine(stringValue(args.input)), 160)}`;
      if (t === 'wait') return args.terminate === true ? 'Stop running command' : 'Wait for command';
      if (t === 'shell_command') return `Shell: ${truncate(firstLine(stringValue(args.command)), 160)}`;
      if (t === 'apply_patch') return 'Apply patch';
      if (t === 'request_user_input') return `Ask user: ${truncate(firstLine(firstQuestion(args)), 160)}`;
      if (t === 'spawn_agent') return `Spawn agent: ${truncate(firstLine(stringValue(args.task_name)), 160)}`;
      if (t === 'followup_task' || t === 'send_message') return `Message agent: ${truncate(firstLine(stringValue(args.target)), 160)}`;
      if (t === 'wait_agent') return 'Wait for agents';
      if (t === 'list_agents') return 'List agents';
      try {
        return `${t}: ${truncate(JSON.stringify(args), 140)}`;
      } catch {
        return t;
      }
    }
  }
}
