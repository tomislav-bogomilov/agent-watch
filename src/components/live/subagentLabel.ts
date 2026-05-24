const PREFIX = 'agent-';

function bareAgentId(fileId: string): string {
  return fileId.startsWith(PREFIX) ? fileId.slice(PREFIX.length) : fileId;
}

export function subagentLabel(fileId: string): string {
  return `SUBAGENT ${bareAgentId(fileId).slice(0, 8)}`;
}
