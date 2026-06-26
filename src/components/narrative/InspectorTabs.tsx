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
  /** Px to inset the dock's bottom by, so it clears the LIVE control bar. */
  bottomInset?: number;
}

export function InspectorTabs(props: InspectorTabsProps) {
  const { milestone, onClose, width, onResize, bottomInset = 0, ...narrative } = props;
  const { live } = narrative;
  const [tab, setTab] = useState<Tab>(live ? 'narrative' : 'details');
  const [expanded, setExpanded] = useState(false);

  // Playback keeps the canvas full-bleed until a Thought is selected — the
  // dock appears on node click, as before. LIVE always docks so the Logical
  // Steps overview is reachable without pinning a node (the live multi-pane
  // view has no pin affordance), and defaults to the narrative tab.
  if (tab === 'details' && !milestone && !live) return null;

  const panelWidth = expanded ? Math.round(window.innerWidth / 2) : width;

  return (
    <aside data-testid="inspector-tabs" style={{ ...styles.dock, width: panelWidth, bottom: bottomInset }}>
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
          ? (milestone
              ? <DetailPanel milestone={milestone} onClose={onClose} width={panelWidth} onResize={onResize} />
              : <div style={styles.placeholder}>Select a Thought in the graph to inspect it.</div>)
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
  placeholder: {
    padding: '24px 18px',
    fontSize: 12,
    color: 'var(--text-dim)',
    fontFamily: 'ui-monospace, monospace',
    lineHeight: 1.5,
  },
};
