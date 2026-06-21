import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DetailPanel } from '../DetailPanel';
import { NarrativeTab, type NarrativeTabProps } from './NarrativeTab';
import type { Milestone } from '../../parse/types';
import '../../theme/narrative.css';

type Tab = 'details' | 'narrative';

export interface InspectorTabsProps extends NarrativeTabProps {
  milestone: Milestone | null;
  onClose: () => void;
  width: number;
  onResize: (delta: number) => void;
}

export function InspectorTabs(props: InspectorTabsProps) {
  const { milestone, onClose, width, onResize, ...narrative } = props;
  const [tab, setTab] = useState<Tab>('details');
  const [expanded, setExpanded] = useState(false);

  // Preserve the original DetailPanel behavior: nothing is docked until the
  // user has either a milestone to inspect (Details) or has opened Logical
  // Steps. This keeps the canvas full-bleed before a node is clicked and the
  // e2e expectation that `detail-panel` only appears after a click.
  if (tab === 'details' && !milestone) return null;

  const panelWidth = expanded ? Math.round(window.innerWidth / 2) : width;

  return (
    <aside data-testid="inspector-tabs" style={{ ...styles.dock, width: panelWidth }}>
      <div style={styles.tabbar}>
        <button
          type="button"
          data-testid="tab-details"
          onClick={() => setTab('details')}
          style={tabStyle(tab === 'details')}
        >Details</button>
        <button
          type="button"
          data-testid="tab-narrative"
          onClick={() => setTab('narrative')}
          style={tabStyle(tab === 'narrative')}
        >Logical Steps</button>
        {tab === 'narrative' && (
          <button
            type="button"
            data-testid="tab-expand"
            onClick={() => setExpanded((e) => !e)}
            style={{ ...tabStyle(false), flex: '0 0 auto', padding: '9px 12px' }}
            title="Expand / collapse"
            aria-pressed={expanded}
          >⤢</button>
        )}
      </div>
      <div style={styles.content}>
        {tab === 'details'
          ? <DetailPanel milestone={milestone} onClose={onClose} width={panelWidth} onResize={onResize} />
          : <NarrativeTab {...narrative} />}
      </div>
    </aside>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '9px 0',
    fontSize: 12,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: 1,
    color: active ? 'var(--edge-trail)' : 'var(--text-dim)',
    borderBottom: active ? '2px solid var(--edge-trail)' : '2px solid transparent',
  };
}

const styles = {
  dock: {
    position: 'absolute' as const,
    top: 0, right: 0, bottom: 0,
    zIndex: 8,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    background: '#050810',
    borderLeft: '1px solid rgba(0, 229, 255, 0.55)',
    boxShadow: '-12px 0 24px rgba(0, 0, 0, 0.4)',
  },
  tabbar: {
    display: 'flex' as const,
    alignItems: 'stretch' as const,
    borderBottom: '1px solid rgba(0, 229, 255, 0.22)',
    flexShrink: 0,
  },
  // Positioning context so DetailPanel's absolute <aside> fills only the
  // area beneath the tab bar (not the whole viewport / over the tabs).
  content: {
    position: 'relative' as const,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden' as const,
  },
};
