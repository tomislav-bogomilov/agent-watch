import { describe, expect, it } from 'vitest';
import { extractLabel } from '../../../src/parse/extract-label';
import { extractSummary } from '../../../src/parse/extract-summary';

function tool(toolName: string, input: Record<string, unknown> = {}) {
  return { kind: 'tool_call' as const, toolName, input };
}

describe('shared tool presentation extraction', () => {
  it('gives native Codex tools concise labels and summaries', () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ['exec', { input: '\n  Get-ChildItem\nignored' }, 'Execute', 'Execute: Get-ChildItem'],
      ['wait', {}, 'Wait', 'Wait for command'],
      ['wait', { terminate: true }, 'Stop command', 'Stop running command'],
      ['shell_command', { command: 'git status\nignored' }, 'Shell', 'Shell: git status'],
      ['apply_patch', {}, 'Patch', 'Apply patch'],
      ['request_user_input', { questions: [{ question: 'Which environment should I use?' }] }, 'Ask user', 'Ask user: Which environment should I use?'],
      ['spawn_agent', { task_name: 'parser_review' }, 'Spawn agent', 'Spawn agent: parser_review'],
      ['followup_task', { target: 'parser_review' }, 'Message agent', 'Message agent: parser_review'],
      ['send_message', { target: 'parser_review' }, 'Message agent', 'Message agent: parser_review'],
      ['wait_agent', {}, 'Wait for agents', 'Wait for agents'],
      ['list_agents', {}, 'List agents', 'List agents'],
    ];

    for (const [toolName, input, label, summary] of cases) {
      expect(extractLabel(tool(toolName, input)).label).toBe(label);
      expect(extractSummary(tool(toolName, input))).toBe(summary);
    }
  });

  it('bounds first-line native command summaries at the shared limit', () => {
    const long = 'x'.repeat(200);

    expect(extractSummary(tool('exec', { input: `\n${long}\nignored` }))).toBe(`Execute: ${'x'.repeat(160)}`);
    expect(extractSummary(tool('shell_command', { command: `${long}\nignored` }))).toBe(`Shell: ${'x'.repeat(160)}`);
  });

  it('keeps Claude tool presentation unchanged', () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ['Read', { file_path: '/src/alpha.ts' }, 'Read alpha.ts', 'Read /src/alpha.ts'],
      ['Bash', { command: 'npm test\nignored' }, 'Bash', 'Bash: npm test'],
      ['Edit', { file_path: '/src/alpha.ts' }, 'Edit alpha.ts', 'Edit /src/alpha.ts'],
      ['Write', { file_path: '/src/alpha.ts' }, 'Write alpha.ts', 'Write /src/alpha.ts'],
      ['Grep', { pattern: 'needle', path: '/src' }, 'Grep', "Grep 'needle' in /src"],
    ];

    for (const [toolName, input, label, summary] of cases) {
      expect(extractLabel(tool(toolName, input)).label).toBe(label);
      expect(extractSummary(tool(toolName, input))).toBe(summary);
    }
  });

  it('keeps the bounded JSON fallback for unknown tools', () => {
    const input = { value: 'x'.repeat(200) };

    expect(extractLabel(tool('FutureTool', input)).label).toBe('FutureTool');
    expect(extractSummary(tool('FutureTool', input))).toBe(`FutureTool: ${JSON.stringify(input).slice(0, 140)}`);
  });
});
