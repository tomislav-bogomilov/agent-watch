import { useState, type CSSProperties } from 'react';
import type { Milestone } from '../../parse/types';
import { CountdownChip } from './CountdownChip';

type Props = {
  kind: 'main' | 'subagent';
  label: string;
  milestones: Milestone[];
  closingSeconds?: number | null;
  frozen?: boolean;
  onToggleFreeze?: () => void;
};

const wrapper: CSSProperties = {
  position: 'relative',
  background: '#050810',
  overflow: 'hidden',
  display: 'flex',
};

const clip: CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)',
  pointerEvents: 'none',
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
    position: 'absolute',
    width: 12,
    height: 12,
    background: color,
    boxShadow: `0 0 6px ${color}`,
    clipPath: polygons[corner],
    pointerEvents: 'none',
    zIndex: 3,
    ...pos,
  };
}

const canvasArea: CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: 'relative',
  background:
    'radial-gradient(ellipse 60% 80% at 50% 40%, rgba(0,229,255,0.04), transparent 70%),'
    + ' linear-gradient(transparent 49.5px, rgba(110,224,238,0.04) 50px),'
    + ' linear-gradient(90deg, transparent 49.5px, rgba(110,224,238,0.04) 50px)',
  backgroundSize: 'auto, 50px 50px, 50px 50px',
};

const headerStyle = (color: string): CSSProperties => ({
  position: 'absolute',
  top: 0, left: 0, right: 0,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 14px',
  background: 'linear-gradient(rgba(5,8,13,0.95), rgba(5,8,13,0.5))',
  borderBottom: '1px solid rgba(110,224,238,0.08)',
  fontSize: 9,
  letterSpacing: 2,
  color,
  fontFamily: 'ui-monospace, monospace',
  zIndex: 5,
  pointerEvents: 'none',
});

const detailStyle: CSSProperties = {
  width: '36%',
  minWidth: 160,
  flexShrink: 0,
  borderLeft: '1px solid rgba(110,224,238,0.18)',
  background: 'rgba(5,8,13,0.92)',
  padding: '24px 12px 12px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  color: '#d4e9f0',
  overflow: 'auto',
  position: 'relative',
  zIndex: 4,
};

const nodeStyle: CSSProperties = {
  position: 'absolute',
  width: 18,
  height: 18,
  borderRadius: '50%',
  border: '1px solid rgba(110,224,238,0.6)',
  background: 'rgba(5,8,13,0.6)',
  cursor: 'pointer',
};

const activeNodeStyle: CSSProperties = {
  background: '#00e5ff',
  boxShadow: '0 0 10px #00e5ff, 0 0 18px #00e5ff',
  borderColor: 'transparent',
};

export function LivePane({ kind, label, milestones, closingSeconds, frozen, onToggleFreeze }: Props) {
  const accent = kind === 'main' ? '#00e5ff' : '#b894ff';
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const newest = milestones[milestones.length - 1] ?? null;
  const selected = (pinnedId ? milestones.find((m) => m.id === pinnedId) : null) ?? newest;

  return (
    <div
      data-testid="live-pane"
      style={{
        ...wrapper,
        animation: `${kind === 'main' ? 'paneBreathe' : 'subBreathe'} 3.5s ease-in-out infinite`,
        clipPath: clip.clipPath,
      }}
    >
      <span style={notchStyle('tl', accent)} />
      <span style={notchStyle('tr', accent)} />
      <span style={notchStyle('bl', accent)} />
      <span style={notchStyle('br', accent)} />

      <div style={canvasArea}>
        <div style={headerStyle(accent)}>
          <span>{label}</span>
          <span style={{ color: '#6e95a5' }}>{newest?.summary ?? ''}</span>
        </div>

        {/* Simple linear node row — real layout uses NodeShape/EdgePath in a follow-up. */}
        <div style={{ position: 'absolute', top: 30, left: 12, right: 12, bottom: 12 }}>
          {milestones.map((m, idx) => (
            <button
              key={m.id}
              data-testid={`live-pane-node-${m.id}`}
              onClick={() => setPinnedId(m.id)}
              style={{
                ...nodeStyle,
                ...(m === newest ? activeNodeStyle : {}),
                left: idx * 26,
                top: 30,
              }}
              title={m.label}
            />
          ))}
        </div>

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
          </>
        )}
      </aside>
    </div>
  );
}
