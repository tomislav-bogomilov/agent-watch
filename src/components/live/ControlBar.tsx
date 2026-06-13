import { useEffect, useState, type CSSProperties } from 'react';
import type { ControlRow } from './controlRows';

type Props = {
  rows: ControlRow[];
  installed: boolean;
  installing: boolean;
  nowMs: number;
  onPause: (target: string) => void;
  onResume: (target: string, note: string | null) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onInstall: () => void;
};

const CYAN = '#00e5ff';
const VIOLET = '#b894ff';
const AMBER = '#fbbf24';

const barStyle: CSSProperties = {
  marginTop: 10,
  flexShrink: 0,
  border: '1px solid rgba(0,229,255,0.25)',
  background: 'rgba(5,8,13,0.85)',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: 1,
  color: '#a5f3fc',
  padding: '4px 10px',
};

const lineStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 22 };

const btnStyle = (color: string, disabled = false): CSSProperties => ({
  background: 'rgba(5,8,13,0.6)',
  border: `1px solid ${color}`,
  color,
  fontFamily: 'ui-monospace, monospace',
  fontSize: 9,
  letterSpacing: 2,
  padding: '2px 8px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  flexShrink: 0,
});

const dotStyle = (color: string): CSSProperties => ({
  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
  background: color, boxShadow: `0 0 6px ${color}`,
});

const steerInputStyle: CSSProperties = {
  flex: 1, minWidth: 80,
  background: 'rgba(69,42,7,0.3)',
  border: `1px solid rgba(245,158,11,0.5)`,
  color: '#fde68a',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  padding: '2px 6px',
};

function rowColor(row: ControlRow): string {
  if (row.paused) return AMBER;
  return row.target === 'main' ? CYAN : VIOLET;
}

function fmtElapsed(heldSince: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - heldSince) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function ControlBar({
  rows, installed, installing, nowMs,
  onPause, onResume, onPauseAll, onResumeAll, onInstall,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const anyPaused = rows.some((r) => r.paused);
  useEffect(() => { if (anyPaused) setExpanded(true); }, [anyPaused]);

  const runningCount = rows.filter((r) => !r.paused).length;
  const pausedCount = rows.length - runningCount;

  return (
    <div data-testid="control-bar" style={barStyle}>
      <div style={lineStyle}>
        <span style={{ fontSize: 8, letterSpacing: 3, color: '#6e95a5' }}>AGENTS</span>
        {rows.map((r) => <span key={r.target} style={dotStyle(rowColor(r))} title={r.label} />)}
        <span style={{ color: '#6e95a5' }}>
          {runningCount} running{pausedCount > 0 ? ` · ${pausedCount} paused` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {anyPaused ? (
          <button type="button" data-testid="control-resume-all" style={btnStyle(AMBER)} onClick={onResumeAll}>
            ▶ RESUME ALL
          </button>
        ) : (
          <button
            type="button"
            data-testid="control-pause-all"
            style={btnStyle(AMBER, !installed)}
            disabled={!installed}
            title={installed ? 'pause all agents at their next tool call' : 'install the gate hook first'}
            onClick={onPauseAll}
          >⏸ ALL</button>
        )}
        <button
          type="button"
          data-testid="control-bar-toggle"
          aria-expanded={expanded}
          style={btnStyle('#155e6e')}
          onClick={() => setExpanded((v) => !v)}
        >{expanded ? '▾' : '▴'}</button>
      </div>

      {expanded && !installed && (
        <div style={{ ...lineStyle, color: AMBER }}>
          <span>gate hook not installed — pausing needs one entry in ~/.claude/settings.json (backup taken)</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="control-install" style={btnStyle(AMBER, installing)} disabled={installing} onClick={onInstall}>
            {installing ? 'INSTALLING…' : 'INSTALL GATE HOOK'}
          </button>
        </div>
      )}

      {expanded && rows.map((row) => {
        const color = rowColor(row);
        return (
          <div key={row.target} data-testid={`control-row-${row.target}`} style={{ ...lineStyle, color }}>
            <span style={dotStyle(color)} />
            <span style={{ flexShrink: 0 }}>{row.label}</span>
            <span style={{
              color: '#6e95a5', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: row.paused ? '0 1 auto' : 1, minWidth: 0,
            }}>{row.summary}</span>
            {row.paused ? (
              <>
                <span style={{ color: AMBER, flexShrink: 0 }}>
                  {row.held
                    ? `holding: ${row.held.toolName}(${row.held.toolInputSummary.slice(0, 60)}) · paused ${fmtElapsed(row.held.heldSince, nowMs)}`
                    : 'engaging… (catches the next tool call)'}
                </span>
                <input
                  data-testid={`control-steer-${row.target}`}
                  style={steerInputStyle}
                  placeholder="steer › guidance delivered on resume"
                  value={notes[row.target] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.target]: e.target.value }))}
                />
                <button
                  type="button"
                  data-testid={`control-resume-${row.target}`}
                  style={btnStyle(AMBER)}
                  onClick={() => {
                    const note = (notes[row.target] ?? '').trim();
                    onResume(row.target, note || null);
                    setNotes((n) => ({ ...n, [row.target]: '' }));
                  }}
                >▶ RESUME</button>
              </>
            ) : (
              <button
                type="button"
                data-testid={`control-pause-${row.target}`}
                style={btnStyle(color, !installed)}
                disabled={!installed}
                title={installed ? `pause ${row.label} at its next tool call` : 'install the gate hook first'}
                onClick={() => onPause(row.target)}
              >⏸</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
