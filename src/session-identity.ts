import type { SessionRef } from './parse/types';

export function sessionKey(ref: SessionRef): string {
  return `${ref.provider}/${ref.projectId}/${ref.sessionId}`;
}

export function sessionTitleKey(ref: SessionRef): string {
  return sessionKey(ref);
}
