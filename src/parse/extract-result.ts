export type ResultInput = {
  toolName: string;
  isError: boolean;
  content: string;
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function lastNonEmptyLine(s: string): string {
  const lines = s.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.length > 0) return t;
  }
  return '';
}

function extractBashExitCode(content: string): number | null {
  const m = content.match(/<exit_code>(\d+)<\/exit_code>/);
  if (m) return Number(m[1]);
  return null;
}

function extractBashStreams(content: string): { stdout: string; stderr: string } {
  const stdoutMatch = content.match(/<stdout>([\s\S]*?)<\/stdout>/);
  const stderrMatch = content.match(/<stderr>([\s\S]*?)<\/stderr>/);
  return {
    stdout: stdoutMatch ? stdoutMatch[1] : '',
    stderr: stderrMatch ? stderrMatch[1] : '',
  };
}

export function extractResult(input: ResultInput): string {
  if (input.isError) {
    return `⚠ error: ${truncate(input.content.trim(), 160)}`;
  }

  const t = input.toolName;
  const content = input.content;

  if (t === 'Read') {
    const lines = content.split(/\r?\n/);
    const lineCount = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
    const bytes = new TextEncoder().encode(content.replace(/\r?\n$/, '')).length;
    let firstNonEmpty = '';
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\d+→/, '').trim();
      if (trimmed.length > 0) {
        firstNonEmpty = trimmed;
        break;
      }
    }
    return `${lineCount} lines, ${bytes} bytes — starts: ${truncate(firstNonEmpty, 80)}`;
  }

  if (t === 'Bash') {
    const exitCode = extractBashExitCode(content) ?? 0;
    const { stdout, stderr } = extractBashStreams(content);
    const stream = exitCode === 0 ? stdout : stderr || stdout;
    const last = lastNonEmptyLine(stream);
    return `exit ${exitCode} — ${truncate(last, 120)}`;
  }

  if (t === 'Edit') {
    const m = content.match(/(\d+)\s+replacement/i);
    if (m) return `${m[1]} replacements`;
    return truncate(content.trim(), 160);
  }

  if (t === 'Write') {
    const m = content.match(/(?:Wrote|wrote)\s+(\d+)\s+bytes/);
    if (m) return `Wrote ${m[1]} bytes`;
    return truncate(content.trim(), 160);
  }

  if (t === 'Grep') {
    const m = content.match(/(\d+)\s+matches?\s+in\s+(\d+)\s+files?/i);
    if (m) return `${m[1]} matches in ${m[2]} files`;
    return truncate(content.trim(), 160);
  }

  return truncate(content.trim(), 160);
}
