import type { Milestone } from '../parse/types';
import { formatTokens } from '../util/formatTokens';

type Props = { milestone: Milestone; screenX: number; screenY: number };

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const cornerStyle: Record<Corner, React.CSSProperties> = {
  tl: { top: -1, left: -1, transform: 'rotate(0deg)' },
  tr: { top: -1, right: -1, transform: 'rotate(90deg)' },
  br: { bottom: -1, right: -1, transform: 'rotate(180deg)' },
  bl: { bottom: -1, left: -1, transform: 'rotate(270deg)' },
};

function CornerBracket({ position }: { position: Corner }) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 11 11"
      style={{ position: 'absolute', pointerEvents: 'none', ...cornerStyle[position] }}
      aria-hidden
    >
      <path
        d="M 0,11 L 0,0 L 11,0"
        fill="none"
        stroke="#5cf2ff"
        strokeWidth={1.6}
        style={{ filter: 'drop-shadow(0 0 2px rgba(92,242,255,0.85))' }}
      />
    </svg>
  );
}

export function NodeTooltip({ milestone, screenX, screenY }: Props) {
  return (
    <div
      data-testid="node-tooltip"
      style={{
        position: 'absolute',
        left: screenX + 14,
        top: screenY + 14,
        maxWidth: 360,
        background: 'rgba(15,38,50,0.94)',
        border: '1px solid #00e5ff',
        padding: '10px 12px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: '#aeeaf2',
        pointerEvents: 'none',
        zIndex: 10,
        boxShadow: '0 0 24px rgba(0,229,255,0.18)',
        letterSpacing: 0.3,
      }}
    >
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />

      <div style={styles.label}>{milestone.label}</div>
      <div style={styles.summary}>{milestone.summary}</div>

      {milestone.usage && (
        <div data-testid="node-tooltip-context" style={styles.contextBlock}>
          <div style={styles.contextHead}>
            CTX · {formatTokens(milestone.contextSize ?? 0)}
          </div>
          <div style={styles.contextRow}>
            <span style={styles.contextRowLabel}>input</span>
            <span style={styles.contextRowValue}>{formatTokens(milestone.usage.input)}</span>
          </div>
          <div style={styles.contextRow}>
            <span style={styles.contextRowLabel}>cache</span>
            <span style={styles.contextRowValue}>
              {formatTokens(milestone.usage.cacheRead + milestone.usage.cacheCreation)}
            </span>
          </div>
          <div style={styles.contextRow}>
            <span style={styles.contextRowLabel}>output</span>
            <span style={styles.contextRowValue}>{formatTokens(milestone.usage.output)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  label: {
    color: '#00e5ff',
    letterSpacing: 1.5,
    fontWeight: 700 as const,
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  summary: {
    color: 'rgba(174,234,242,0.78)',
    fontSize: 11,
    lineHeight: 1.4,
  },
  contextBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid rgba(0,229,255,0.42)',
  },
  contextHead: {
    color: '#7fffd4',
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: 600 as const,
    marginBottom: 4,
  },
  contextRow: {
    display: 'grid' as const,
    gridTemplateColumns: 'auto 1fr',
    columnGap: 8,
    fontSize: 10,
  },
  contextRowLabel: {
    color: 'rgba(95,169,184,0.95)',
  },
  contextRowValue: {
    textAlign: 'right' as const,
    color: '#e8faff',
    fontWeight: 600 as const,
  },
};
