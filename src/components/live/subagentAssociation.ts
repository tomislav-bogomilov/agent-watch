import type { ProviderId } from '../../parse/types';
import { subagentLabel } from './subagentLabel';

export type AssociableSubagentEntry = {
  key: string;
  spawnThreadId?: string;
  spawnLabel: string;
};

export function liveSubagentKey(
  provider: ProviderId,
  spawn: { id: string; spawnThreadId?: string },
): string {
  const identity = provider === 'codex' && spawn.spawnThreadId
    ? spawn.spawnThreadId
    : spawn.id;
  return `spawn:${identity}`;
}

export function associateSubagentFiles(
  provider: ProviderId,
  entries: AssociableSubagentEntry[],
  subagentMtimes: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  if (provider === 'codex') {
    for (const entry of entries) {
      const threadId = entry.spawnThreadId;
      if (threadId && Object.prototype.hasOwnProperty.call(subagentMtimes, threadId)) {
        map.set(entry.key, threadId);
      }
    }
    return map;
  }

  const fileIds = Object.keys(subagentMtimes).sort();
  entries.forEach((entry, index) => {
    const fileId = fileIds[index];
    if (fileId) map.set(entry.key, fileId);
  });
  return map;
}

export function liveSubagentLabel(
  provider: ProviderId,
  fileId: string,
  spawnLabel: string,
): string {
  if (provider === 'claude') return subagentLabel(fileId);
  const normalized = spawnLabel.replace(/^→\s*/, '').trim();
  return normalized || subagentLabel(fileId);
}
