import { useMemo, useState, type CSSProperties } from 'react';
import { GraphCanvas } from '../GraphCanvas';
import { CountdownChip } from './CountdownChip';
import { makeLivePlayback } from './livePlayback';
import type { Session, Milestone } from '../../parse/types';
import type { Filters } from '../FilterToggles';

type Props = {
  kind: 'main' | 'subagent';
  label: string;
  /** A standalone Milestone tree this pane renders. For MAIN: the full main-agent trail's root. For subagent panes: spawn + inner subtree (see extractSubagentPaneRoot). */
  root: Milestone;
  cwd: string;
  /** Used for the synthetic Session. Any string is fine — distinguishes panes for the camera + layout cache. */
  paneId: string;
  closingSeconds?: number | null;
  frozen?: boolean;
  onToggleFreeze?: () => void;
};

const ALL_FILTERS: Filters = { hidePruned: false, hideSubagents: false, successOnly: false, showAllContext: false };

const wrapper: CSSProperties = {
  position: 'relative',
  background: '#050810',
  overflow: 'hidden',
  display: 'flex',
  clipPath:
    'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px),'
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

const canvasHost: CSSProperties = {
  flex: 1, minWidth: 0, position: 'relative',
  paddingTop: 22,
};

const detailStyle: CSSProperties = {
  width: '36%', minWidth: 160, flexShrink: 0,
  borderLeft: '1px solid rgba(110,224,238,0.18)',
  background: 'rgba(5,8,13,0.92)',
  padding: '24px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11, color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative', zIndex: 4,
};

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

export function LivePane({ kind, label, root, cwd, paneId, closingSeconds, frozen, onToggleFreeze }: Props) {
  const accent = kind === 'main' ? '#00e5ff' : '#b894ff';
  const [pinnedId, setPinnedId] = useState<string | null>(null);

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
  const subagentIds = useMemo(() => collectSubagentIds(root), [root]);

  const newest = playback.order[playback.index] ?? null;
  const selected = (pinnedId ? playback.order.find((m) => m.id === pinnedId) : null) ?? newest;

  return (
    <div
      data-testid="live-pane"
      style={{
        ...wrapper,
        animation: `${kind === 'main' ? 'paneBreathe' : 'subBreathe'} 3.5s ease-in-out infinite`,
      }}
    >
      <span style={notchStyle('tl', accent)} />
      <span style={notchStyle('tr', accent)} />
      <span style={notchStyle('bl', accent)} />
      <span style={notchStyle('br', accent)} />

      <div style={canvasHost}>
        <div style={headerStyle(accent)}>
          <span>{label}</span>
          <span style={{ color: '#6e95a5' }}>{newest?.summary ?? ''}</span>
        </div>

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
        />

        {closingSeconds != null && onToggleFreeze && (
          <CountdownChip
            seconds={closingSeconds}
            frozen={frozen ?? false}
            onToggleFreeze={onToggleFreeze}
          />
        )}
      </div>

      <aside data-testid="live-pane-detail" style={detailStyle}>
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
