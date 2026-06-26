import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';
import type { TokenUsagePayload } from '../../server/usage-sync';
import type { MemoryResponse, MemoryRecord, MemoryType } from '../../server/memory-store';
import type { NarrativeState } from '../narrative/types';

export type { TokenUsageRow, TokenUsageProject } from '../../server/aggregate-token-usage';
export type { PriceEntry, PriceTable } from '../../server/model-pricing';
export type TokenUsageResponse = TokenUsagePayload;
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
  scopeKey: string, fileName: string, patch: { description: string; type: MemoryType; body: string }
): Promise<MemoryRecord> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(fileName)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update failed: ${res.status}`);
  return (await res.json()) as MemoryRecord;
}

export async function deleteMemory(scopeKey: string, fileName: string): Promise<{ brokenBacklinks: string[] }> {
  const res = await fetch(`/api/memory/${encodeURIComponent(scopeKey)}/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  return (await res.json()) as { brokenBacklinks: string[] };
}

export interface NarratorInput { id: string; kind: string; label: string; summary: string; result?: string }

const narrativeUrl = (p: string, s: string, action = '') =>
  `/api/narrative/${encodeURIComponent(p)}/${encodeURIComponent(s)}${action ? `/${action}` : ''}`;

export async function fetchNarrative(projectId: string, sessionId: string): Promise<NarrativeState> {
  const res = await fetch(narrativeUrl(projectId, sessionId));
  if (!res.ok) throw new Error(`narrative fetch failed: ${res.status}`);
  return (await res.json()) as NarrativeState;
}

async function postNarrative(
  projectId: string, sessionId: string, action: string, milestones: NarratorInput[],
): Promise<NarrativeState> {
  const res = await fetch(narrativeUrl(projectId, sessionId, action), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ milestones }),
  });
  if (!res.ok) throw new Error(`narrative ${action} failed: ${res.status}`);
  return (await res.json()) as NarrativeState;
}

export const startNarrative = (p: string, s: string, m: NarratorInput[]) => postNarrative(p, s, 'start', m);
export const tickNarrative = (p: string, s: string, m: NarratorInput[]) => postNarrative(p, s, 'tick', m);
export const refreshNarrative = (p: string, s: string, m: NarratorInput[]) => postNarrative(p, s, 'refresh', m);
