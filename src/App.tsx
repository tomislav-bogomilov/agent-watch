import { useEffect, useMemo, useRef, useState } from 'react';
import { LibraryPanel, type Selection } from './components/library/LibraryPanel';
import type { LibraryMode } from './components/library/LibraryPanel';
import { GraphCanvas } from './components/GraphCanvas';
import { LivePanes } from './components/live/LivePanes';
import { AppHeader } from './components/AppHeader';
import { NowPlaying } from './components/NowPlaying';
import { PlaybackControls } from './components/PlaybackControls';
import { InspectorTabs } from './components/narrative/InspectorTabs';
import { FilterToggles, type Filters } from './components/FilterToggles';
import { Legend } from './components/Legend';
import { TokensPage } from './tokens/TokensPage';
import { MemoryPage } from './memory/MemoryPage';
import { useTokenUsage } from './api/hooks';
import { presetCutoff, type RangePreset } from './tokens/aggregate';
import { CopyCwdButton } from './components/CopyCwdButton';
import { usePromptList, useSession, useSessionList, isLiveMeta } from './api/hooks';
import { sliceSession } from './parse/slice';
import { usePlayback } from './playback/usePlayback';
import { useKeyboard } from './playback/useKeyboard';
import { usePersistentWidth } from './util/usePersistentWidth';
import { formatPath } from './util/formatPath';
import type { CameraApi } from './graph/useCamera';
import type { Milestone, Session } from './parse/types';
import type { Family } from './tokens/family';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 520;
const DETAIL_MIN = 320;
const DETAIL_MAX = 720;
const NARROW_THRESHOLD = 1400;
const CONTENT_MAX = 2400;

const STORAGE_MODE = 'tg.library.mode';
const STORAGE_FAMILY = 'tg.usage.family';
const STORAGE_PRESET = 'tg.usage.preset';

function readPreset(): RangePreset {
  try {
    const raw = localStorage.getItem(STORAGE_PRESET);
    if (raw === '7d' || raw === '30d' || raw === '90d' || raw === 'all') return raw;
    return '30d';
  } catch {
    return '30d';
  }
}

function readMode(): LibraryMode {
  try {
    const raw = localStorage.getItem(STORAGE_MODE);
    if (raw === 'prompts' || raw === 'usage' || raw === 'memory') return raw;
    return 'sessions';
  } catch {
    return 'sessions';
  }
}

function readFamily(): Family {
  try {
    const raw = localStorage.getItem(STORAGE_FAMILY);
    if (raw === 'opus' || raw === 'sonnet' || raw === 'haiku' || raw === 'all') return raw;
    return 'all';
  } catch {
    return 'all';
  }
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

function CornerNotch({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const polygons = {
    tl: 'polygon(0 0, 100% 0, 0 100%)',
    tr: 'polygon(0 0, 100% 0, 100% 100%)',
    bl: 'polygon(0 0, 0 100%, 100% 100%)',
    br: 'polygon(100% 0, 100% 100%, 0 100%)',
  };
  const pos =
    corner === 'tl' ? { top: 0, left: 0 } :
    corner === 'tr' ? { top: 0, right: 0 } :
    corner === 'bl' ? { bottom: 0, left: 0 } :
    { bottom: 0, right: 0 };
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: 12, height: 12,
        background: 'var(--edge-trail)',
        boxShadow: '0 0 6px var(--edge-trail)',
        clipPath: polygons[corner],
        pointerEvents: 'none',
        zIndex: 6,
        ...pos,
      }}
    />
  );
}

export default function App() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [mode, setMode] = useState<LibraryMode>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#/tokens') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return 'usage';
    }
    return readMode();
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_MODE, mode); } catch { /* ignore */ }
  }, [mode]);
  const [family, setFamily] = useState<Family>(() => readFamily());
  useEffect(() => {
    try { localStorage.setItem(STORAGE_FAMILY, family); } catch { /* ignore */ }
  }, [family]);
  const [preset, setPreset] = useState<RangePreset>(() => readPreset());
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PRESET, preset); } catch { /* ignore */ }
  }, [preset]);
  const usageQuery = useTokenUsage();
  const usageProjectId: 'all' = 'all';
  const today = new Date().toISOString().slice(0, 10);
  const usageCutoffDay = presetCutoff(preset, today);
  const sessionsQuery = useSessionList();
  const knownSessionIds = useMemo(
    () => new Set((sessionsQuery.data ?? []).map((s) => s.sessionId)),
    [sessionsQuery.data]
  );
  const selectedMeta = useMemo(() => {
    if (!selected || selected.kind === 'memory' || !sessionsQuery.data) return null;
    return sessionsQuery.data.find(
      (s) => s.projectId === selected.projectId && s.sessionId === selected.sessionId
    ) ?? null;
  }, [selected, sessionsQuery.data]);
  const sessionIsLive = selectedMeta ? isLiveMeta(selectedMeta) : false;
  const [liveEngaged, setLiveEngaged] = useState(false);
  const { data: rawSession, isLoading, error } = useSession(
    selected?.kind === 'session' || selected?.kind === 'prompt' ? selected.projectId : null,
    selected?.kind === 'session' ? selected.sessionId
      : selected?.kind === 'prompt' ? selected.sessionId : null,
    sessionIsLive || liveEngaged,
  );
  const promptsQuery = usePromptList();

  // For prompt selections, derive an `effectiveSession` whose root is the
  // sliced chain. For session selections, pass the parsed session through.
  const effectiveSession: Session | null = useMemo(() => {
    if (!rawSession) return null;
    if (selected?.kind === 'prompt') return sliceSession(rawSession, selected.promptId);
    return rawSession;
  }, [rawSession, selected]);

  const { state: playback, controls } = usePlayback(effectiveSession?.root ?? null);
  const subagentIds = useMemo(
    () => (effectiveSession ? collectSubagentIds(effectiveSession.root) : new Set<string>()),
    [effectiveSession]
  );

  const currentMilestone = playback.order[playback.index] ?? null;
  const inSubagent = currentMilestone ? subagentIds.has(currentMilestone.id) : false;

  const [creatingScope, setCreatingScope] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    hidePruned: false,
    hideSubagents: false,
    successOnly: false,
    showAllContext: false,
  });
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = usePersistentWidth('tg.sidebar.width', 280, SIDEBAR_MIN, SIDEBAR_MAX);
  const [detailWidth, setDetailWidth] = usePersistentWidth('tg.detail.width', 420, DETAIL_MIN, DETAIL_MAX);
  useEffect(() => { setPinnedId(null); setPanelDismissed(false); }, [selected]);
  const lastAutoEngagedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || selected.kind === 'memory' || !selectedMeta) {
      lastAutoEngagedRef.current = null;
      return;
    }
    const key = `${selected.projectId}/${selected.sessionId}`;
    if (lastAutoEngagedRef.current === key) return;
    lastAutoEngagedRef.current = key;
    setLiveEngaged(isLiveMeta(selectedMeta));
  }, [selected, selectedMeta]);
  useEffect(() => {
    if (playback.playing) {
      setPanelDismissed(false);
      setPinnedId(null);
    }
  }, [playback.playing]);

  useEffect(() => {
    let lastBucket: 'narrow' | 'wide' =
      window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
    setSidebarCollapsed(lastBucket === 'narrow');
    const onResize = () => {
      const next: 'narrow' | 'wide' =
        window.innerWidth < NARROW_THRESHOLD ? 'narrow' : 'wide';
      if (next !== lastBucket) {
        lastBucket = next;
        setSidebarCollapsed(next === 'narrow');
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pinnedMilestone = useMemo(() => {
    if (!effectiveSession || !pinnedId) return null;
    return playback.order.find((m) => m.id === pinnedId) ?? null;
  }, [effectiveSession, pinnedId, playback.order]);

  const showLive = !pinnedMilestone && !panelDismissed && (playback.playing || playback.index > 0);
  const displayedMilestone = pinnedMilestone ?? (showLive ? currentMilestone : null);

  // Narrative (Logical Steps) wiring: the ordered milestone ids drive the
  // id->index sync, and a trimmed milestone list feeds the narrator. Built
  // inline here — the client must never import server code.
  const orderIds = useMemo(() => playback.order.map((m) => m.id), [playback.order]);
  const narratorMilestones = useMemo(
    () => playback.order.map((m) => ({
      id: m.id, kind: m.kind, label: m.label, summary: m.summary, result: m.result,
    })),
    [playback.order],
  );
  const inspectorSession = (selected?.kind === 'session' || selected?.kind === 'prompt')
    ? { projectId: selected.projectId, sessionId: selected.sessionId }
    : { projectId: '', sessionId: '' };

  function handleDetailClose(): void {
    if (pinnedId) setPinnedId(null);
    else setPanelDismissed(true);
  }

  const cameraRef = useRef<CameraApi | null>(null);
  const followingControls = useMemo<typeof controls>(() => ({
    ...controls,
    play: () => { cameraRef.current?.setFollow(true); controls.play(); },
    toggle: () => {
      if (!playback.playing) cameraRef.current?.setFollow(true);
      controls.toggle();
    },
    step: (d) => { cameraRef.current?.setFollow(true); controls.step(d); },
    scrubTo: (i) => { cameraRef.current?.setFollow(true); controls.scrubTo(i); },
    restart: () => { cameraRef.current?.setFollow(true); controls.restart(); },
  }), [controls, playback.playing]);
  useKeyboard({
    controls: followingControls,
    onFit: () => cameraRef.current?.fit(),
    onToggleFollow: () => cameraRef.current?.setFollow(!cameraRef.current.follow),
    onToggleSidebar: () => setSidebarCollapsed((v) => !v),
    onCloseDetail: handleDetailClose,
  });
  const needsConfirm = !!effectiveSession && effectiveSession.totalMilestones > 1000 && !confirmedIds.has(effectiveSession.id);

  // Header overlay: in prompt mode, show `PROMPT N` where N = ordinal+1
  // taken from the prompts query (cheap lookup, falls back to id).
  const headerTitle = useMemo(() => {
    if (!effectiveSession) return '';
    if (selected?.kind === 'prompt') {
      const p = promptsQuery.data?.find((x) => x.promptId === selected.promptId);
      const n = p ? p.ordinal + 1 : null;
      return n != null ? `PROMPT ${n}` : 'PROMPT';
    }
    return `SESSION ${effectiveSession.id.slice(0, 8)}`;
  }, [effectiveSession, selected, promptsQuery.data]);

  const isMissingSlice = !!rawSession && selected?.kind === 'prompt' && effectiveSession === null;

  function handleJumpToSession(sessionId: string): void {
    const meta = sessionsQuery.data?.find((s) => s.sessionId === sessionId);
    if (!meta) return;
    setSelected({ kind: 'session', projectId: meta.projectId, sessionId: meta.sessionId });
    setMode('sessions');
  }

  return (
    <div style={styles.shell}>
      <AppHeader mode={mode} onModeChange={(m) => { setMode(m); setCreatingScope(null); }} />
      <div style={styles.body}>
        <LibraryPanel
        selected={selected}
        onSelect={(s) => { setSelected(s); setCreatingScope(null); }}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        width={sidebarWidth}
        onResize={(d) => setSidebarWidth((w) => w + d)}
        mode={mode}
        usageRows={usageQuery.data?.rows ?? []}
        usageProjectId={usageProjectId}
        usageCutoffDay={usageCutoffDay}
        usageFamily={family}
        onUsageFamilyChange={setFamily}
        onCreateMemory={(scopeKey) => { setMode('memory'); setCreatingScope(scopeKey); }}
      />
      <main style={styles.main}>
        <div style={styles.contentFrame}>
          {mode === 'usage' ? <TokensPage family={family} preset={preset} onPresetChange={setPreset} />
           : mode === 'memory' ? (
             <MemoryPage
               selected={selected}
               onSelectMemory={(scopeKey, name) => { setSelected({ kind: 'memory', scopeKey, name }); setCreatingScope(null); }}
               onJumpToSession={handleJumpToSession}
               creatingScope={creatingScope}
               onCreateDone={() => setCreatingScope(null)}
               knownSessionIds={knownSessionIds}
             />
           ) : (<>
          {!selected && <div style={styles.empty}>SELECT A SESSION</div>}
          {selected && isLoading && <div style={styles.empty}>LOADING…</div>}
          {selected && error && <div style={styles.error}>error: {(error as Error).message}</div>}
          {isMissingSlice && <div style={styles.empty} data-testid="prompt-not-found">PROMPT NOT FOUND</div>}
          {effectiveSession && needsConfirm && (
            <div style={styles.overflow} data-testid="overflow-confirm">
              <div style={styles.overflowMsg}>
                LARGE SESSION — {effectiveSession.totalMilestones} MILESTONES
              </div>
              <div style={styles.overflowSub}>Rendering may take a moment.</div>
              <button
                style={styles.overflowBtn}
                data-testid="load-anyway"
                onClick={() => setConfirmedIds((s) => new Set(s).add(effectiveSession.id))}
              >
                LOAD ANYWAY
              </button>
            </div>
          )}
          {effectiveSession && !needsConfirm && (
            <div style={styles.canvasSlot}>
              <div style={styles.sessionHeader} data-testid="session-header">
                <div style={styles.sessionHeaderText}>
                  <div style={styles.sessionTitle}>{headerTitle}</div>
                  <div style={styles.sessionCwdRow}>
                    <span
                      style={styles.sessionCwd}
                      title={effectiveSession.cwd}
                      data-testid="session-cwd"
                    >
                      {formatPath(effectiveSession.cwd)}
                    </span>
                    <CopyCwdButton value={effectiveSession.cwd} />
                  </div>
                </div>
                {!liveEngaged && (
                  <div style={styles.headerToolGroup} data-testid="canvas-toolbar">
                    <button
                      type="button"
                      style={styles.headerToolBtn}
                      onClick={() => cameraRef.current?.fit()}
                      data-testid="fit-button"
                      aria-label="fit"
                      title="fit (F)"
                    >FIT</button>
                    <button
                      type="button"
                      style={{
                        ...styles.headerToolBtn,
                        ...(cameraRef.current?.follow ? styles.headerToolBtnOn : null),
                      }}
                      onClick={() => {
                        const next = !(cameraRef.current?.follow ?? false);
                        cameraRef.current?.setFollow(next);
                      }}
                      aria-pressed={cameraRef.current?.follow ?? false}
                      data-testid="follow-toggle"
                      aria-label="follow"
                      title="follow (C)"
                    >FOLLOW</button>
                    {sessionIsLive && (
                      <button
                        type="button"
                        style={{
                          ...styles.headerToolBtn,
                          ...(liveEngaged ? styles.headerToolBtnOn : null),
                        }}
                        onClick={() => setLiveEngaged((v) => !v)}
                        aria-pressed={liveEngaged}
                        data-testid="live-button"
                        aria-label="live"
                        title="toggle live"
                      >LIVE</button>
                    )}
                  </div>
                )}
              </div>

              {liveEngaged ? (
                <LivePanes
                  session={effectiveSession}
                  projectId={(selected?.kind === 'session' || selected?.kind === 'prompt') ? selected.projectId : ''}
                  subagentMtimes={effectiveSession.subagentMtimes}
                  onToggleLive={() => setLiveEngaged((v) => !v)}
                />
              ) : (
                <div style={styles.canvasCard}>
                  <CornerNotch corner="tl" />
                  <CornerNotch corner="tr" />
                  <CornerNotch corner="bl" />
                  <CornerNotch corner="br" />
                  <GraphCanvas
                    session={effectiveSession}
                    playback={playback}
                    subagentIds={subagentIds}
                    pinnedId={pinnedId}
                    onPin={setPinnedId}
                    onScrubTo={followingControls.scrubTo}
                    filters={filters}
                    onCameraReady={(api) => { cameraRef.current = api; }}
                    liveEngaged={liveEngaged}
                    detailPanelOpen={!!displayedMilestone}
                    detailPanelWidth={detailWidth}
                  />
                  <FilterToggles value={filters} onChange={setFilters} />
                  <Legend />
                </div>
              )}
            </div>
          )}
          {effectiveSession && !needsConfirm && !liveEngaged && (
            <div data-testid="chrome-gutter" style={styles.gutter}>
              <NowPlaying current={currentMilestone} edgeProgress={playback.edgeProgress} inSubagent={inSubagent} speed={playback.speed} />
              <PlaybackControls state={playback} controls={followingControls} />
            </div>
          )}
          <InspectorTabs
            key={`${inspectorSession.projectId}/${inspectorSession.sessionId}`}
            milestone={displayedMilestone}
            onClose={handleDetailClose}
            width={detailWidth}
            onResize={(d) => setDetailWidth((w) => w + d)}
            projectId={inspectorSession.projectId}
            sessionId={inspectorSession.sessionId}
            live={liveEngaged}
            milestones={narratorMilestones}
            orderIds={orderIds}
            currentIndex={playback.index}
            onScrubToIndex={(i) => followingControls.scrubTo(i)}
          />
        </>)}
        </div>
      </main>
      </div>
    </div>
  );
}

const styles = {
  shell: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  body: { display: 'flex' as const, flex: 1, minHeight: 0 },
  main: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  contentFrame: {
    maxWidth: CONTENT_MAX,
    width: '100%',
    margin: '0 auto',
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    position: 'relative' as const,
    minHeight: 0,
  },
  canvasSlot: { flex: 1, minHeight: 0, position: 'relative' as const },
  gutter: {
    flexShrink: 0,
    borderTop: '1px solid var(--grid)',
    background: 'rgba(5,8,13,0.5)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    padding: '8px 16px',
    minWidth: 0,
    overflow: 'hidden' as const,
  },
  empty: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', letterSpacing: 4,
  },
  error: { padding: 24, color: 'var(--node-failed)' },
  sessionHeader: {
    position: 'absolute' as const,
    top: 16,
    left: 24,
    right: 24,
    zIndex: 5,
    pointerEvents: 'none' as const,
    display: 'flex' as const,
    alignItems: 'flex-end' as const,
    gap: 14,
  },
  sessionTitle: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'var(--edge-trail)',
    fontFamily: 'ui-monospace, monospace',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  sessionCwd: {
    fontSize: 11,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    marginTop: 2,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  sessionCwdRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    marginTop: 2,
    pointerEvents: 'auto' as const,
    minWidth: 0,
  },
  overflow: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-dim)', gap: 12,
  },
  overflowMsg: {
    letterSpacing: 4, fontSize: 13, color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowSub: {
    fontSize: 11, color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
  },
  overflowBtn: {
    background: 'transparent', border: '1px solid var(--edge-trail)',
    color: 'var(--edge-trail)', padding: '8px 18px', cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace', letterSpacing: 3, fontSize: 11,
    boxShadow: '0 0 12px rgba(0, 229, 255, 0.25)',
  },
  canvasCard: {
    position: 'absolute' as const,
    inset: 0,
    border: '1px solid rgba(0,229,255,0.55)',
    clipPath: [
      'polygon(',
      '12px 0, calc(100% - 12px) 0,',
      '100% 12px, 100% calc(100% - 12px),',
      'calc(100% - 12px) 100%, 12px 100%,',
      '0 calc(100% - 12px), 0 12px',
      ')',
    ].join(''),
    animation: 'paneBreathe 3.5s ease-in-out infinite',
    overflow: 'hidden' as const,
  },
  headerToolGroup: {
    display: 'flex' as const,
    gap: 6,
    marginLeft: 'auto',
    flexShrink: 0,
    pointerEvents: 'auto' as const,
  },
  headerToolBtn: {
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid rgba(110, 224, 238, 0.6)',
    color: 'var(--text)',
    fontSize: 10,
    letterSpacing: 2,
    padding: '4px 10px',
    textTransform: 'uppercase' as const,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer' as const,
  },
  headerToolBtnOn: {
    background: 'rgba(0,229,255,0.10)',
    color: 'var(--edge-trail)',
    borderColor: 'var(--edge-trail)',
  },
  sessionHeaderText: {
    minWidth: 0,
    flexShrink: 1,
    flexGrow: 1,
    pointerEvents: 'auto' as const,
  },
};
