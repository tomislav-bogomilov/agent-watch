import type { PromptMeta, SessionMeta, SessionPayload } from '../parse/types';

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
