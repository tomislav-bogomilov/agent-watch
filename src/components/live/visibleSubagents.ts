import { SUBAGENT_STABLE_MS } from './liveness';
import type { PaneState } from './paneStatus';

export function pickVisibleSubagentEntries<E extends { key: string }>(
  entries: E[],
  keyToFileId: Map<string, string>,
  subagentMtimes: Record<string, string>,
  statusMap: Record<string, PaneState>,
  nowMs: number,
): E[] {
  return entries.filter((e) => {
    const status = statusMap[e.key]?.status;
    if (status === 'closed') return false;
    if (status === 'closing' || status === 'frozen') return true;
    const fileId = keyToFileId.get(e.key);
    if (!fileId) return false;
    const mtimeIso = subagentMtimes[fileId];
    if (!mtimeIso) return false;
    const mtimeMs = new Date(mtimeIso).getTime();
    return nowMs - mtimeMs < SUBAGENT_STABLE_MS;
  });
}
