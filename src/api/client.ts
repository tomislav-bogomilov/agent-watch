import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';
import type { TokenUsageResponse } from '../../server/aggregate-token-usage';
import type { MemoryResponse, MemoryRecord, MemoryType } from '../../server/memory-store';

export type { TokenUsageResponse, TokenUsageRow, TokenUsageProject } from '../../server/aggregate-token-usage';
export type { MemoryResponse, MemoryRecord, MemoryType, MemoryScope, MemoryIndexEntry } from '../../server/memory-store';

export async function fetchSessionList(): Promise<SessionMeta[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  const json = (await res.json()) as { sessions: SessionMeta[] };
  return json.sessions;
}

export async function fetchSessionPayload(
  projectId: string,
  sessionId: string
): Promise<SessionPayload> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(projectId)}/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`session fetch failed: ${res.status}`);
  return (await res.json()) as SessionPayload;
}

export async function fetchPromptList(): Promise<PromptMeta[]> {
  const res = await fetch('/api/prompts');
  if (!res.ok) throw new Error(`prompt list failed: ${res.status}`);
  const json = (await res.json()) as { prompts: PromptMeta[] };
  return json.prompts;
}

export async function fetchTokenUsage(): Promise<TokenUsageResponse> {
  const res = await fetch('/api/token-usage');
  if (!res.ok) throw new Error(`token usage fetch failed: ${res.status}`);
  return (await res.json()) as TokenUsageResponse;
}

export async function fetchMemory(): Promise<MemoryResponse> {
  const res = await fetch('/api/memory');
  if (!res.ok) throw new Error(`memory fetch failed: ${res.status}`);
  return (await res.json()) as MemoryResponse;
}

export async function createMemory(
  scopeKey: string, input: { name: string; description: string; type: MemoryType; body: string }
): Promise<MemoryRecord> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  if (res.status === 409) throw new Error('A memory with that name already exists');
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  return (await res.json()) as MemoryRecord;
}

export async function updateMemory(
  scopeKey: string, name: string, patch: { description: string; type: MemoryType; body: string }
): Promise<MemoryRecord> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(name)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update failed: ${res.status}`);
  return (await res.json()) as MemoryRecord;
}

export async function deleteMemory(scopeKey: string, name: string): Promise<{ brokenBacklinks: string[] }> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  return (await res.json()) as { brokenBacklinks: string[] };
}
