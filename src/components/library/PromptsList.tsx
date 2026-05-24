import type { PromptMeta } from '../../parse/types';
import { ItemShell } from './ItemShell';

type Props = {
  items: PromptMeta[];
  sessionTitles: Record<string, string>;
  selectedPromptId: string | null;
  onSelect: (p: PromptMeta) => void;
};

function sessionSubtitle(p: PromptMeta, titles: Record<string, string>): string {
  const renamed = titles[p.sessionId];
  if (renamed) return renamed;
  return `SESSION ${p.sessionId.slice(0, 8)}`;
}

export function PromptsList({ items, sessionTitles, selectedPromptId, onSelect }: Props) {
  return (
    <ul style={styles.list}>
      {items.map((p) => {
        const isSelected = selectedPromptId === p.promptId;
        return (
          <ItemShell
            key={p.promptId}
            selected={isSelected}
            onClick={() => onSelect(p)}
            testId={`prompt-item-${p.promptId}`}
          >
            <div style={styles.itemTitle} title={p.text}>{p.text}</div>
            <div style={styles.itemSub} title={p.sessionId}>{sessionSubtitle(p, sessionTitles)}</div>
            <div style={styles.itemMeta}>{new Date(p.timestamp).toLocaleString()}</div>
          </ItemShell>
        );
      })}
    </ul>
  );
}

const styles = {
  list: { listStyle: 'none', padding: 0, margin: 0 },
  itemTitle: {
    fontSize: 10,
    color: 'var(--text)',
    display: '-webkit-box' as const,
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden' as const,
    whiteSpace: 'normal' as const,
    lineHeight: 1.35,
    wordBreak: 'break-word' as const,
    fontFamily: 'ui-monospace, monospace',
  },
  itemSub: {
    fontSize: 10,
    color: 'var(--edge-trail)',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginTop: 2,
    fontFamily: 'ui-monospace, monospace',
  },
};
