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
  /** True when the AGENT behind this pane is paused via the control gate (not view-freeze). Amber echo: header chip + glow. */
  agentPaused?: boolean;
  /** True once the gate has actually caught this agent at a tool call (a held call exists). Distinguishes "held" from "pause pending" (clicked, but the agent hasn't hit its next tool-call boundary yet). */
  agentHeld?: boolean;
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
  background: 'transparent', // was '#050810' — let the body grid show through
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

const headerStyle = (color: string, hasClose: boolean): CSSProperties => ({
  position: 'absolute',
  top: 8,
  left: 8,
  right: hasClose ? 36 : 8,
  height: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0 10px', gap: 12,
  background: 'rgba(5,8,13,0.85)',
  border: `1px solid ${color}33`,
  borderRadius: 2,
  fontSize: 9, letterSpacing: 2, color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5, pointerEvents: 'none',
  backdropFilter: 'blur(2px)',
});

const canvasHost = (withHeader: boolean): CSSProperties => ({
  flex: 1, minWidth: 0, position: 'relative',
  paddingTop: withHeader ? 36 : 0,
});

type AccentRgb = readonly [number, number, number]; // r, g, b

const ACCENT_MAIN: AccentRgb = [0, 229, 255];        // cyan
const ACCENT_SUB:  AccentRgb = [184, 148, 255];      // purple

// inset from clip-path corners + BR notch (margin top tracks header band)
function detailStyle(withHeader: boolean, accent: AccentRgb): CSSProperties {
  const [r, g, b] = accent;
  const topStopAlpha = accent === ACCENT_MAIN ? 0.08 : 0.10;
  const topEdgeAlpha = accent === ACCENT_MAIN ? 0.22 : 0.28;
  return {
    width: '36%', minWidth: 160, flexShrink: 0,
    margin: withHeader ? '36px 12px 12px 0' : '12px 12px 12px 0',
    borderLeft: `1px solid rgba(${r}, ${g}, ${b}, 0.55)`,
    background: [
      `linear-gradient(180deg, rgba(${r},${g},${b},${topStopAlpha}), rgba(5,8,13,0.95) 60%, rgba(5,8,13,1))`,
      '#050810',
    ].join(', '),
    boxShadow: [
      `inset 1px 0 0 rgba(${r}, ${g}, ${b}, ${topEdgeAlpha})`,
      `inset 6px 0 18px rgba(${r}, ${g}, ${b}, 0.06)`,
    ].join(', '),
    padding: 12,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11, color: '#d4e9f0',
    overflow: 'auto',
    position: 'relative', zIndex: 4,
  };
}

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
  agentPaused = false,
  agentHeld = false,
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
  // The graph's active node + FOLLOW camera always track `newest` (the live
  // playhead). The detail aside normally mirrors that, but a click pins it to a
  // specific node so it can be read while the stream advances. The pin is
  // re-resolved against each fresh poll's order, so a pinned node's own content
  // (e.g. a result filling in) still updates in place. `pinned` is null once the
  // node leaves the tree or the user escapes via the PINNED control.
  const pinned = pinnedId ? playback.order.find((m) => m.id === pinnedId) ?? null : null;
  const selected = pinned ?? newest;

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
        ...(agentPaused ? { boxShadow: '0 0 18px rgba(245,158,11,0.35)' } : {}),
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

      {agentPaused && (
        <div
          data-testid="live-pane-paused-banner"
          data-phase={agentHeld ? 'held' : 'pending'}
          style={{
            position: 'absolute',
            top: showHeader ? 38 : 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 16px',
            background: 'rgba(40,24,4,0.94)',
            border: '1px solid #fbbf24',
            borderRadius: 3,
            color: '#fde68a',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12, letterSpacing: 2, fontWeight: 700,
            boxShadow: '0 0 18px rgba(245,158,11,0.55)',
            pointerEvents: 'none', whiteSpace: 'nowrap',
            ...(agentHeld ? {} : { animation: 'pausePulse 1.2s ease-in-out infinite' }),
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>⏸</span>
          <span>{agentHeld ? 'PAUSED BY CLAUDEWATCH' : 'PAUSE PENDING'}</span>
          <span style={{ fontSize: 8, letterSpacing: 1, color: '#fbbf24', opacity: 0.85, fontWeight: 400 }}>
            {agentHeld ? 'held at tool call' : 'holds at next tool call'}
          </span>
        </div>
      )}

      {showHeader && (
        <div style={headerStyle(accent, !!onClose)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span>{label}</span>
            {agentPaused && (
              <span
                data-testid="live-pane-paused-chip"
                style={{
                  flexShrink: 0, border: '1px solid #fbbf24', color: '#fbbf24',
                  fontSize: 8, letterSpacing: 2, padding: '0 5px', borderRadius: 2,
                  boxShadow: '0 0 6px rgba(245,158,11,0.5)',
                }}
              >PAUSED</span>
            )}
          </span>
          <span
            style={{
              color: '#6e95a5',
              flex: '1 1 auto',
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'right',
            }}
          >
            {newest?.summary ?? ''}
          </span>
        </div>
      )}

      <div style={canvasHost(showHeader)}>
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

      <aside data-testid="live-pane-detail" style={detailStyle(showHeader, kind === 'main' ? ACCENT_MAIN : ACCENT_SUB)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: accent }}>
            {kind === 'main' ? 'MAIN · NODE' : 'SUBAGENT · NODE'}
          </span>
          {pinned && (
            <button
              type="button"
              data-testid="live-pane-unpin"
              onClick={() => setPinnedId(null)}
              title="return to live"
              aria-label="return to live"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(5,8,13,0.6)',
                border: `1px solid ${accent}`,
                color: accent,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 8,
                letterSpacing: 2,
                padding: '2px 6px',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: `0 0 6px ${accent}55`,
              }}
            >
              <span aria-hidden style={{ fontSize: 7 }}>●</span>
              PINNED
              <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>✕</span>
            </button>
          )}
        </div>
        {selected && (
          <>
            <div style={{ fontSize: 11, color: '#d4e9f0', marginBottom: 4 }}>{selected.label}</div>
            <div style={{ fontSize: 10, color: '#6e95a5' }}>{selected.summary}</div>
            {selected.result && (
              <div style={{ fontSize: 10, color: selected.failed ? 'var(--node-failed)' : '#6e95a5', marginTop: 6, whiteSpace: 'pre-wrap' }}>{selected.result}</div>
            )}
            {selected.detail && (
              <pre style={{
                fontSize: 10, color: '#6e95a5',
                whiteSpace: 'pre-wrap', margin: '8px 0 0 0',
                background: 'rgba(15,38,50,0.4)', padding: '6px 8px',
                border: '1px solid var(--grid)',
              }}>{selected.detail}</pre>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
