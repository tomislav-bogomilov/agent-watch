import type { Milestone } from '../parse/types';
import { formatTokens } from '../util/formatTokens';

type Props = { milestone: Milestone; screenX: number; screenY: number };

export function NodeTooltip({ milestone, screenX, screenY }: Props) {
  return (
    <div
      data-testid="node-tooltip"
      style={{
        position: 'absolute',
        left: screenX + 14,
        top: screenY + 14,
        maxWidth: 360,
        background: 'rgba(5,8,13,0.95)',
        border: '1px solid var(--edge-idle)',
        padding: '6px 10px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        color: 'var(--text)',
        pointerEvents: 'none',
        zIndex: 10,
        boxShadow: '0 0 12px rgba(0, 229, 255, 0.15)',
      }}
    >
      <div style={{ color: 'var(--edge-trail)', marginBottom: 2 }}>{milestone.label}</div>
      <div style={{ color: 'var(--text-dim)' }}>{milestone.summary}</div>
      {milestone.usage && (
        <div
          data-testid="node-tooltip-context"
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px solid var(--grid)',
            color: 'var(--text-dim)',
            fontSize: 11,
          }}
        >
          <div style={{ color: 'var(--edge-trail)', marginBottom: 2 }}>
            ctx · {formatTokens(milestone.contextSize ?? 0)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8 }}>
            <span>input</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.input)}</span>
            <span>cache</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.cacheRead + milestone.usage.cacheCreation)}</span>
            <span>output</span><span style={{ textAlign: 'right', color: 'var(--text)' }}>{formatTokens(milestone.usage.output)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
