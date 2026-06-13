import type { ControlSnapshot, HeldInfo } from '../../../server/control-state';
import { subagentLabel } from './subagentLabel';

export type ControlRow = {
  target: 'main' | string;     // 'main' or agent file id — the API pause/resume target
  label: string;
  summary: string;
  paused: boolean;
  held: HeldInfo | null;       // the held tool call, once the gate has caught it
};

export function buildControlRows(
  subEntries: { key: string; summary: string }[],
  keyToFileId: Map<string, string>,
  snapshot: ControlSnapshot,
  mainSummary: string,
): ControlRow[] {
  const heldBy = new Map(snapshot.held.map((h) => [h.owner, h]));
  const rows: ControlRow[] = [{
    target: 'main',
    label: 'MAIN',
    summary: mainSummary,
    paused: snapshot.all || snapshot.main,
    held: heldBy.get('main') ?? null,
  }];
  for (const e of subEntries) {
    const fileId = keyToFileId.get(e.key);
    if (!fileId) continue; // unmapped pane: only PAUSE ALL reaches it (audit H2)
    rows.push({
      target: fileId,
      label: subagentLabel(fileId),
      summary: e.summary,
      paused: snapshot.all || snapshot.agents[fileId] === true,
      held: heldBy.get(fileId) ?? null,
    });
  }
  return rows;
}
