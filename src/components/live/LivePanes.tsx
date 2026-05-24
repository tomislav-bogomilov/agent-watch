import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Session, Milestone } from '../../parse/types';
import { LivePane } from './LivePane';
import { extractSubagentPaneRoot } from './extractSubagentPaneRoot';
import { subagentLabel } from './subagentLabel';
import { nextPaneStatus, remainingSeconds, type PaneState } from './paneStatus';
import { TICK_MS, CLOSING_MS, SUBAGENT_STABLE_MS } from './liveness';
import { pickVisibleSubagentEntries } from './visibleSubagents';
import { GraphCanvas } from '../GraphCanvas';
import { makeLivePlayback } from './livePlayback';
import type { Filters } from '../FilterToggles';
import { CanvasToolbar } from '../CanvasToolbar';
import type { CameraApi } from '../../graph/useCamera';

type Props = {
  session: Session;
  subagentMtimes: Record<string, string>;
  onToggleLive: () => void;
};

const ALL_FILTERS: Filters = { hidePruned: false, hideSubagents: false, successOnly: false, showAllContext: false };

const outerStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '56px 12px 12px 12px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};

const gridStyle = (n: number): CSSProperties => ({
  flex: 1,
  display: 'grid',
  gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr',
  gap: 12,
  background: 'rgba(0,229,255,0.05)',
  minHeight: 0,
});

const fullscreenStyle: CSSProperties = {
  flex: 1, minHeight: 0, position: 'relative',
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

function collectSubagentIds(root: Milestone): Set<string> {
  const ids = new Set<string>();
  function walk(node: Milestone, inSub: boolean): void {
    if (inSub) ids.add(node.id);
    if (node.kind === 'subagent_spawn' && node.children.length >= 1) {
      walk(node.children[0], true);
      if (node.children[1]) walk(node.children[1], inSub);
      return;
    }
    for (const c of node.children) walk(c, inSub);
  }
  walk(root, false);
  return ids;
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

  const [statusMap, setStatusMap] = useState<Record<string, PaneState>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainCameraRef = useRef<CameraApi | null>(null);
  const mainFittedRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    setStatusMap((prev) => {
      const next: Record<string, PaneState> = {};
      for (const e of subagentEntries) {
        const fileId = keyToFileId.get(e.key);
        const mtimeIso = fileId ? subagentMtimes[fileId] : undefined;
        const lastUpdatedMs = mtimeIso ? new Date(mtimeIso).getTime() : nowMs;
        const staleAtOpen = (nowMs - lastUpdatedMs) >= SUBAGENT_STABLE_MS;
        const prevState: PaneState = prev[e.key] ?? (staleAtOpen
          ? { status: 'closed', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
          : { status: 'active', closingStartedAt: null, frozenAt: null, frozenRemainingMs: null }
        );
        next[e.key] = nextPaneStatus(prevState, lastUpdatedMs, nowMs);
      }
      return next;
    });
  }, [nowMs, subagentEntries, keyToFileId, subagentMtimes]);

  const displayable = pickVisibleSubagentEntries(subagentEntries, keyToFileId, subagentMtimes, statusMap, nowMs);
  const total = 1 + displayable.length;

  const mainOrderLength = useMemo(
    () => (total === 1 ? makeLivePlayback(mainRoot).order.length : 0),
    [total, mainRoot],
  );

  useEffect(() => {
    if (total !== 1) return;
    const cam = mainCameraRef.current;
    if (!cam) return;
    cam.setFollow(true);
  }, [total, mainOrderLength]);

  function freezeToggle(key: string): void {
    setStatusMap((prev) => {
      const s = prev[key];
      if (!s) return prev;
      if (s.status === 'frozen') {
        const newClosingStartedAt = nowMs - (CLOSING_MS - (s.frozenRemainingMs ?? CLOSING_MS));
        return { ...prev, [key]: { ...s, status: 'closing', frozenAt: null, frozenRemainingMs: null, closingStartedAt: newClosingStartedAt } };
      }
      if (s.status === 'closing') {
        const elapsed = nowMs - (s.closingStartedAt ?? nowMs);
        const remaining = Math.max(0, CLOSING_MS - elapsed);
        return { ...prev, [key]: { ...s, status: 'frozen', frozenAt: nowMs, frozenRemainingMs: remaining } };
      }
      return prev;
    });
  }

  // N=1 fullscreen short-circuit — render GraphCanvas directly with no cut-corner border.
  if (total === 1) {
    const mainPlayback = makeLivePlayback(mainRoot);
    const mainSession: Session = { ...session, root: mainRoot, totalMilestones: mainPlayback.order.length };
    const subagentIds = collectSubagentIds(mainRoot);
    return (
      <div style={outerStyle}>
        <CanvasToolbar
          showLive={true}
          liveEngaged={true}
          onToggleLive={onToggleLive}
          showFit={true}
          onFit={() => mainCameraRef.current?.fit()}
          showFollow={false}
          follow={false}
          onToggleFollow={() => {}}
        />
        <div data-testid="live-panes-grid" data-n={1} data-fullscreen="true" style={fullscreenStyle}>
          <GraphCanvas
            session={mainSession}
            playback={mainPlayback}
            subagentIds={subagentIds}
            pinnedId={null}
            onPin={() => { /* App-level detail panel takes over at N=1 */ }}
            onScrubTo={() => { /* no playback in LIVE */ }}
            filters={ALL_FILTERS}
            liveEngaged={true}
            compact={false}
            onCameraReady={(api) => {
              mainCameraRef.current = api;
              if (!mainFittedRef.current) {
                mainFittedRef.current = true;
                api.fit();
                api.setFollow(true);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // N≥2: cut-corner pane grid.
  return (
    <div style={outerStyle}>
      <div data-testid="live-panes-grid" data-n={total} style={gridStyle(total)}>
        <LivePane kind="main" label="MAIN" root={mainRoot} cwd={session.cwd} paneId="main" />
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
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
