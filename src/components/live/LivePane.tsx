import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GraphCanvas } from '../GraphCanvas';
import { CountdownChip } from './CountdownChip';
import { makeLivePlayback } from './livePlayback';
import type { Session, Milestone } from '../../parse/types';
import type { Filters } from '../FilterToggles';
import type { CameraApi } from '../../graph/useCamera';

type Props = {
  kind: 'main' | 'subagent';
  label: string;
  /** A standalone Milestone tree this pane renders. For MAIN: the buildMainRoot output (sub-agent inner content stripped). For subagent panes: spawn + inner subtree (see extractSubagentPaneRoot). */
  root: Milestone;
  cwd: string;
  /** Used for the synthetic Session. Any string is fine — distinguishes panes for the camera + layout cache. */
  paneId: string;
  closingSeconds?: number | null;
  frozen?: boolean;
  onToggleFreeze?: () => void;
  /** When true, skip the cut-corner border, pane header, notches, and breathing animation. Used by the N=1 short-circuit so a single LIVE MAIN reads as a fullscreen canvas (with its detail panel still on the right). */
  borderless?: boolean;
  /** Exposes the inner GraphCanvas camera api so parents (LivePanes N=1) can wire toolbar FIT actions. */
  onCameraReady?: (api: CameraApi) => void;
  /** When provided, renders a red close button in the pane's top-right. Clicking it flips the pane status to 'closed' immediately (skipping the closing countdown). MAIN panes do not get this affordance — there's exactly one per session. */
  onClose?: () => void;
};

const ALL_FILTERS: Filters = { hidePruned: false, hideSubagents: false, successOnly: false, showAllContext: false };

const wrapper: CSSProperties = {
  position: 'relative',
  background: '#050810',
  overflow: 'hidden',
  display: 'flex',
  width: '100%',
  height: '100%',
};

const borderClip: CSSProperties = {
  clipPath:
    'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px),'
    + ' calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
};

// Same border clip but with the top-right cut omitted — used on panes that
// carry the close button, so the magenta triangle can land its right angle
// exactly on the pane's top-right corner instead of fighting the cut diagonal.
const borderClipSharpTR: CSSProperties = {
  clipPath:
    'polygon(12px 0, 100% 0, 100% calc(100% - 12px),'
    + ' calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
};

function notchStyle(corner: 'tl'|'tr'|'bl'|'br', color: string): CSSProperties {
  const polygons = {
    tl: 'polygon(0 0, 100% 0, 0 100%)',
    tr: 'polygon(0 0, 100% 0, 100% 100%)',
    bl: 'polygon(0 0, 0 100%, 100% 100%)',
    br: 'polygon(100% 0, 100% 100%, 0 100%)',
  };
  const pos: CSSProperties = corner === 'tl' ? { top: 0, left: 0 }
    : corner === 'tr' ? { top: 0, right: 0 }
    : corner === 'bl' ? { bottom: 0, left: 0 }
    : { bottom: 0, right: 0 };
  return {
    position: 'absolute', width: 12, height: 12,
    background: color, boxShadow: `0 0 6px ${color}`,
    clipPath: polygons[corner], pointerEvents: 'none', zIndex: 3,
    ...pos,
  };
}

const headerStyle = (color: string): CSSProperties => ({
  position: 'absolute', top: 0, left: 0, right: 0, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 14px',
  background: 'linear-gradient(rgba(5,8,13,0.95), rgba(5,8,13,0.5))',
  borderBottom: '1px solid rgba(110,224,238,0.08)',
  fontSize: 9, letterSpacing: 2, color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5, pointerEvents: 'none',
});

const canvasHost = (withHeader: boolean): CSSProperties => ({
  flex: 1, minWidth: 0, position: 'relative',
  paddingTop: withHeader ? 22 : 0,
});

const detailStyle = (withHeader: boolean): CSSProperties => ({
  width: '36%', minWidth: 160, flexShrink: 0,
  borderLeft: '1px solid rgba(110,224,238,0.18)',
  background: 'rgba(5,8,13,0.92)',
  padding: withHeader ? '24px 12px 12px' : '12px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11, color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative', zIndex: 4,
});

function collectInnerSubagentIds(root: Milestone): Set<string> {
  // Only marks descendants of a spawn's children[0] (the inner subtree). Walks
  // the structure produced by extractSubagentPaneRoot — that helper returns
  // spawn-as-root with the inner subtree as the only child, so the entire
  // subtree under that root is "in subagent" for visual purposes.
  // For buildMainRoot output (where children[0] is the main continuation,
  // not a subagent inner), this would falsely mark the main chain; callers
  // for kind='main' should NOT use this — we return empty instead.
  const ids = new Set<string>();
  function walk(node: Milestone): void {
    ids.add(node.id);
    for (const c of node.children) walk(c);
  }
  if (root.kind === 'subagent_spawn' && root.children[0]) {
    walk(root.children[0]);
  }
  return ids;
}

export function LivePane({
  kind, label, root, cwd, paneId,
  closingSeconds, frozen, onToggleFreeze,
  borderless = false, onCameraReady, onClose,
}: Props) {
  const accent = kind === 'main' ? '#00e5ff' : '#b894ff';
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const cameraRef = useRef<CameraApi | null>(null);
  const fittedRef = useRef(false);

  const session: Session = useMemo(() => ({
    id: paneId,
    cwd,
    startedAt: '',
    root,
    successPath: new Set<string>(),
    totalMilestones: 0,
    subagentMtimes: {},
  }), [paneId, cwd, root]);

  const playback = useMemo(() => makeLivePlayback(root), [root]);
  // For kind='main' the tree is buildMainRoot output (inner subtrees stripped).
  // Marking children[0] of spawns as inSub there would mistakenly paint the
  // main continuation purple — pass an empty Set instead.
  const subagentIds = useMemo(
    () => (kind === 'main' ? new Set<string>() : collectInnerSubagentIds(root)),
    [kind, root]
  );

  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    // Every time the playback grows (a new milestone arrived via LIVE poll),
    // re-fit the whole tree so the user can see the new node appear inside
    // the pane instead of being culled off-screen at scale=1, then re-enable
    // follow so subsequent in-fit playhead changes stay centered.
    cam.fit();
    cam.setFollow(true);
  }, [playback.order.length]);

  const newest = playback.order[playback.index] ?? null;
  const selected = (pinnedId ? playback.order.find((m) => m.id === pinnedId) : null) ?? newest;

  const showHeader = !borderless;
  const showNotches = !borderless;
  const showAnimation = !borderless;

  return (
    <div
      data-testid="live-pane"
      style={{
        ...wrapper,
        ...(borderless ? {} : (onClose ? borderClipSharpTR : borderClip)),
        ...(showAnimation
          ? { animation: `${kind === 'main' ? 'paneBreathe' : 'subBreathe'} 3.5s ease-in-out infinite` }
          : {}),
      }}
    >
      {showNotches && <>
        <span style={notchStyle('tl', accent)} />
        {/* The TR notch is omitted when the magenta close triangle occupies that corner instead. */}
        {!onClose && <span style={notchStyle('tr', accent)} />}
        <span style={notchStyle('bl', accent)} />
        <span style={notchStyle('br', accent)} />
      </>}

      {onClose && (
        <button
          data-testid="live-pane-close"
          aria-label={`close pane ${label}`}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            // 28x28 box anchored at the top-right. clip-path leaves the
            // upper-right triangle (TL, TR, BR) — the right-angle sits at
            // the pane's top-right corner. The host pane drops its TR cut
            // when this button is present (borderClipSharpTR) so the full
            // triangle is visible without fighting the cut diagonal.
            position: 'absolute',
            top: 0,
            right: 0,
            width: 28,
            height: 28,
            padding: 0,
            background: '#b537ff',
            border: 'none',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
            cursor: 'pointer',
            boxShadow: '0 0 14px rgba(181, 55, 255, 0.75)',
            zIndex: 7,
          }}
          title="close pane"
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 1,
              right: 4,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 14,
              lineHeight: 1,
              color: '#fff',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >×</span>
        </button>
      )}

      <div style={canvasHost(showHeader)}>
        {showHeader && (
          <div style={headerStyle(accent)}>
            <span>{label}</span>
            <span style={{ color: '#6e95a5' }}>{newest?.summary ?? ''}</span>
          </div>
        )}

        <GraphCanvas
          session={session}
          playback={playback}
          subagentIds={subagentIds}
          pinnedId={pinnedId}
          onPin={setPinnedId}
          onScrubTo={() => { /* no playback in LIVE mode */ }}
          filters={ALL_FILTERS}
          liveEngaged={true}
          compact={true}
          hideSubagentRegions={kind === 'main'}
          onCameraReady={(api) => {
            cameraRef.current = api;
            onCameraReady?.(api);
            if (!fittedRef.current) {
              fittedRef.current = true;
              api.setFollow(true);
            }
          }}
        />

        {closingSeconds != null && onToggleFreeze && (
          <CountdownChip
            seconds={closingSeconds}
            frozen={frozen ?? false}
            onToggleFreeze={onToggleFreeze}
          />
        )}
      </div>

      <aside data-testid="live-pane-detail" style={detailStyle(showHeader)}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: accent, marginBottom: 6 }}>
          {kind === 'main' ? 'MAIN · NODE' : 'SUBAGENT · NODE'}
        </div>
        {selected && (
          <>
            <div style={{ fontSize: 11, color: '#d4e9f0', marginBottom: 4 }}>{selected.label}</div>
            <div style={{ fontSize: 10, color: '#6e95a5' }}>{selected.summary}</div>
            {selected.result && (
              <div style={{ fontSize: 10, color: selected.failed ? 'var(--node-failed)' : '#6e95a5', marginTop: 6, whiteSpace: 'pre-wrap' }}>{selected.result}</div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
