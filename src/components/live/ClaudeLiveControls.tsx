import type { ReactNode } from 'react';
import type { ControlSnapshot } from '../../api/control';
import {
  useControlState,
  useInstallGateHook,
  usePauseTarget,
  useResumeTarget,
} from '../../api/control';
import { buildControlRows } from './controlRows';
import { ControlBar } from './ControlBar';

export const EMPTY_CONTROL_SNAPSHOT: ControlSnapshot = {
  all: false,
  main: false,
  agents: {},
  held: [],
  pendingNotes: [],
};

type Props = {
  projectId: string;
  sessionId: string;
  mainSummary: string;
  subagentRows: { key: string; summary: string }[];
  keyToFileId: Map<string, string>;
  nowMs: number;
  children: (snapshot: ControlSnapshot) => ReactNode;
};

export function ClaudeLiveControls({
  projectId,
  sessionId,
  mainSummary,
  subagentRows,
  keyToFileId,
  nowMs,
  children,
}: Props) {
  const controlQuery = useControlState(projectId, sessionId, true);
  const pauseMut = usePauseTarget(projectId, sessionId);
  const resumeMut = useResumeTarget(projectId, sessionId);
  const installMut = useInstallGateHook(projectId, sessionId);
  const snapshot = controlQuery.data?.control ?? EMPTY_CONTROL_SNAPSHOT;
  const controlRows = buildControlRows(subagentRows, keyToFileId, snapshot, mainSummary);

  return (
    <>
      {children(snapshot)}
      <ControlBar
        rows={controlRows}
        installed={controlQuery.data?.installed ?? false}
        installing={installMut.isPending}
        allPaused={snapshot.all}
        nowMs={nowMs}
        onPause={(target) => pauseMut.mutate(target)}
        onResume={(target, note) => resumeMut.mutate({ target, note })}
        onPauseAll={() => pauseMut.mutate('all')}
        onResumeAll={() => resumeMut.mutate({ target: 'all', note: null })}
        onInstall={() => installMut.mutate()}
      />
    </>
  );
}
