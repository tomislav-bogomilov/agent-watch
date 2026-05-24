import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Session, Milestone } from '../../parse/types';
import { LivePane } from './LivePane';
import { extractSubagentPaneRoot } from './extractSubagentPaneRoot';
import { subagentLabel } from './subagentLabel';
import { remainingSeconds, type PaneState } from './paneStatus';
import { TICK_MS, CLOSING_MS } from './liveness';
import { pickVisibleSubagentEntries } from './visibleSubagents';
import { makeLivePlayback } from './livePlayback';
import { CanvasToolbar } from '../CanvasToolbar';
import type { CameraApi } from '../../graph/useCamera';
import { useNowMs } from './useNowMs';
import { useStatusMap } from './useStatusMap';

type Props = {
  session: Session;
  subagentMtimes: Record<string, string>;
  onToggleLive: () => void;
};

const outerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  padding: '56px 12px 12px 12px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};

const lastSpanStyle: CSSProperties = { gridColumn: 'span 2' };

/** Returns each subagent_spawn node in the tree (DFS order). */
function collectSpawnNodes(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(n: Milestone): void {
    if (n.kind === 'subagent_spawn') out.push(n);
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

/** Build a synthetic Milestone tree for the MAIN pane: the original root with sub-agent inner subtrees stripped (each subagent_spawn becomes a leaf — no children). */
function buildMainRoot(root: Milestone): Milestone {
  function rebuild(node: Milestone): Milestone {
    if (node.kind === 'subagent_spawn') {
      // Drop the inner subtree (children[0]). Keep children[1+] (main continuation).
      return { ...node, children: node.children.slice(1).map(rebuild) };
    }
    return { ...node, children: node.children.map(rebuild) };
  }
  return rebuild(root);
}

export function LivePanes({ session, subagentMtimes, onToggleLive }: Props) {
  // MAIN trail without sub-agent inner content
  const mainRoot = useMemo(() => buildMainRoot(session.root), [session]);

  // Sub-agent panes: one per spawn node, keyed by spawn id
  const spawnNodes = useMemo(() => collectSpawnNodes(session.root), [session]);
  const subagentEntries = useMemo(() => {
    return spawnNodes
      .map((spawn) => {
        const root = extractSubagentPaneRoot(spawn);
        return root ? { key: `spawn:${spawn.id}`, spawnId: spawn.id, root } : null;
      })
      .filter((x): x is { key: string; spawnId: string; root: Milestone } => x !== null);
  }, [spawnNodes]);

  // Alphabetical pairing v1 (per the spec follow-up note).
  const fileIds = useMemo(() => Object.keys(subagentMtimes).sort(), [subagentMtimes]);
  const keyToFileId = useMemo(() => {
    const map = new Map<string, string>();
    subagentEntries.forEach((e, i) => { if (fileIds[i]) map.set(e.key, fileIds[i]); });
    return map;
  }, [subagentEntries, fileIds]);

  const [userClosedKeys, setUserClosedKeys] = useState<Set<string>>(new Set());
  const mainCameraRef = useRef<CameraApi | null>(null);
  const mainFittedRef = useRef(false);

  const nowMs = useNowMs(TICK_MS);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, PaneState>>({});
  const statusMap = useStatusMap(
    subagentEntries, keyToFileId, subagentMtimes, userClosedKeys, statusOverrides
  );

  // Switching to a different live session must re-fit on first ready, so reset
  // both refs whenever session.id changes. Also drop any user-closed flags
  // because a fresh session has no notion of "I closed that one before".
  useEffect(() => {
    mainFittedRef.current = false;
    mainCameraRef.current = null;
    setUserClosedKeys(new Set());
    setStatusOverrides({});
  }, [session.id]);

  const displayable = pickVisibleSubagentEntries(subagentEntries, keyToFileId, subagentMtimes, statusMap, nowMs);
  const total = 1 + displayable.length;

  // Memoize playback once per mainRoot so the follow effect can read order.length.
  const mainPlayback = useMemo(() => makeLivePlayback(mainRoot), [mainRoot]);
  const mainOrderLength = total === 1 ? mainPlayback.order.length : 0;

  useEffect(() => {
    if (total !== 1) return;
    const cam = mainCameraRef.current;
    if (!cam) return;
    cam.setFollow(true);
  }, [total, mainOrderLength]);

  function closePane(key: string): void {
    setUserClosedKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
    // userClosedKeys path in useStatusMap will produce the closed state automatically;
    // no override needed here.
  }

  function freezeToggle(key: string): void {
    const current = statusMap[key];
    if (!current) return;
    if (current.status === 'frozen') {
      const newClosingStartedAt = nowMs - (CLOSING_MS - (current.frozenRemainingMs ?? CLOSING_MS));
      setStatusOverrides((prev) => ({
        ...prev,
        [key]: { ...current, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt },
      }));
    } else if (current.status === 'closing') {
      const elapsed = nowMs - (current.closingStartedAt ?? nowMs);
      const remaining = Math.max(0, CLOSING_MS - elapsed);
      setStatusOverrides((prev) => ({
        ...prev,
        [key]: { ...current, status: 'frozen', frozenAt: nowMs, frozenRemainingMs: remaining },
      }));
    }
  }

  const isSolo = total === 1;
  const gridColumns = isSolo ? '1fr' : '1fr 1fr';

  return (
    <div style={outerStyle}>
      <CanvasToolbar
        showLive={true}
        liveEngaged={true}
        onToggleLive={onToggleLive}
        showFit={isSolo}
        onFit={() => mainCameraRef.current?.fit()}
        showFollow={false}
        follow={false}
        onToggleFollow={() => {}}
      />
      <div
        data-testid="live-panes-grid"
        data-n={total}
        data-fullscreen={isSolo ? 'true' : 'false'}
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: gridColumns,
          gap: isSolo ? 0 : 12,
          background: isSolo ? 'transparent' : 'rgba(0,229,255,0.05)',
          minHeight: 0,
          position: 'relative' as const,
        }}
      >
        <LivePane
          kind="main"
          label="MAIN"
          root={mainRoot}
          cwd={session.cwd}
          paneId="main"
          borderless={isSolo}
          onCameraReady={(api) => { mainCameraRef.current = api; }}
        />
        {displayable.map((e, idx) => {
          const isLastOdd = total % 2 === 1 && idx === displayable.length - 1;
          const fileId = keyToFileId.get(e.key) ?? e.key;
          const status = statusMap[e.key];
          const closingSeconds = status ? remainingSeconds(status, nowMs) : null;
          const frozen = status?.status === 'frozen';
          const showCountdown = status && (status.status === 'closing' || status.status === 'frozen');
          return (
            <div key={e.key} style={isLastOdd ? lastSpanStyle : undefined}>
              <LivePane
                kind="subagent"
                label={subagentLabel(fileId)}
                root={e.root}
                cwd={session.cwd}
                paneId={e.key}
                closingSeconds={showCountdown ? closingSeconds : null}
                frozen={frozen}
                onToggleFreeze={() => freezeToggle(e.key)}
                onClose={() => closePane(e.key)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
