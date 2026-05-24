import { useEffect, useState, type ChangeEventHandler } from 'react';

export type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
  showAllContext: boolean;
};

type Props = { value: Filters; onChange: (next: Filters) => void };

const STORAGE_KEY = 'tg.filters.open';

function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

function writeOpen(v: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

function activeCount(f: Filters): number {
  return (f.hidePruned ? 1 : 0) + (f.hideSubagents ? 1 : 0)
       + (f.successOnly ? 1 : 0) + (f.showAllContext ? 1 : 0);
}

export function FilterToggles({ value, onChange }: Props) {
  const [open, setOpenState] = useState<boolean>(() => readOpen());
  function setOpen(next: boolean): void {
    setOpenState(next);
    writeOpen(next);
  }

  useEffect(() => {
    // Keep state in sync if another tab toggles it (cheap; storage events
    // are infrequent for this key).
    function onStorage(ev: StorageEvent) {
      if (ev.key !== STORAGE_KEY) return;
      setOpenState(ev.newValue === 'true');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function tg<K extends keyof Filters>(k: K): ChangeEventHandler<HTMLInputElement> {
    return (e) => onChange({ ...value, [k]: e.currentTarget.checked });
  }

  const count = activeCount(value);

  if (!open) {
    return (
      <div data-testid="filter-toggles" style={styles.box}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={styles.chip}
          data-testid="filter-toggle-collapsed"
          aria-label="show filters"
          title="show filters"
        >
          <span style={styles.icon}>≡</span>
          <span>FILTERS</span>
          {count > 0 && <span style={styles.badge}>{count}</span>}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="filter-toggles" style={styles.box}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            <span style={styles.icon}>≡</span> FILTERS
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={styles.close}
            data-testid="filter-close"
            aria-label="collapse filters"
            title="collapse"
          >×</button>
        </div>
        <label style={styles.row}>
          <input type="checkbox" checked={value.hidePruned}
                 onChange={tg('hidePruned')} data-testid="filter-pruned" />
          <span>hide pruned</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.hideSubagents}
                 onChange={tg('hideSubagents')} data-testid="filter-subagents" />
          <span>hide subagents</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.successOnly}
                 onChange={tg('successOnly')} data-testid="filter-success-only" />
          <span>success only</span>
        </label>
        <label style={styles.row}>
          <input type="checkbox" checked={value.showAllContext}
                 onChange={tg('showAllContext')} data-testid="filter-show-all-context" />
          <span>show all context</span>
        </label>
      </div>
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const,
    top: 52,
    left: 24,
    zIndex: 6,
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text)',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    boxShadow: '0 0 5px rgba(0, 229, 255, 0.20)',
    padding: '5px 9px',
    fontSize: 11,
    letterSpacing: 2,
    color: 'var(--text)',
    fontFamily: 'inherit',
    textTransform: 'uppercase' as const,
    cursor: 'pointer' as const,
  },
  icon: { color: 'var(--edge-trail)', fontSize: 12 },
  badge: {
    display: 'inline-block' as const,
    background: 'var(--edge-trail)', color: '#05080d',
    fontSize: 9, fontWeight: 700,
    padding: '0 4px', minWidth: 13, height: 13,
    lineHeight: '13px', textAlign: 'center' as const,
    marginLeft: 4,
  },
  panel: {
    display: 'flex' as const, flexDirection: 'column' as const,
    background: 'rgba(5,8,13,0.92)',
    border: '1px solid var(--edge-idle)',
    boxShadow: '0 0 8px rgba(0, 229, 255, 0.25)',
    minWidth: 180,
    fontSize: 11,
  },
  header: {
    display: 'flex' as const, alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '6px 10px',
    borderBottom: '1px solid rgba(110, 224, 238, 0.14)',
    background: 'linear-gradient(rgba(0, 229, 255, 0.06), rgba(0,229,255,0))',
  },
  headerTitle: {
    fontSize: 10, letterSpacing: 3, color: 'var(--edge-trail)',
    textTransform: 'uppercase' as const,
    display: 'flex' as const, alignItems: 'center' as const, gap: 6,
  },
  close: {
    background: 'transparent', border: 'none',
    color: 'var(--edge-idle)', cursor: 'pointer' as const,
    padding: '0 4px', fontSize: 14, lineHeight: 1,
    fontFamily: 'inherit',
  },
  row: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 8,
    padding: '5px 10px', cursor: 'pointer' as const,
    fontSize: 11,
  },
};
