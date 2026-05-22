import type { ChangeEventHandler } from 'react';

export type Filters = {
  hidePruned: boolean;
  hideSubagents: boolean;
  successOnly: boolean;
};

type Props = { value: Filters; onChange: (next: Filters) => void };

export function FilterToggles({ value, onChange }: Props) {
  function tg<K extends keyof Filters>(k: K): ChangeEventHandler<HTMLInputElement> {
    return (e) => onChange({ ...value, [k]: e.currentTarget.checked });
  }
  return (
    <div data-testid="filter-toggles" style={styles.box}>
      <label style={styles.row}>
        <input type="checkbox" checked={value.hidePruned} onChange={tg('hidePruned')} data-testid="filter-pruned" />
        <span>hide pruned</span>
      </label>
      <label style={styles.row}>
        <input type="checkbox" checked={value.hideSubagents} onChange={tg('hideSubagents')} data-testid="filter-subagents" />
        <span>hide subagents</span>
      </label>
      <label style={styles.row}>
        <input type="checkbox" checked={value.successOnly} onChange={tg('successOnly')} data-testid="filter-success-only" />
        <span>success only</span>
      </label>
    </div>
  );
}

const styles = {
  box: {
    position: 'absolute' as const,
    top: 12,
    right: 120,
    zIndex: 6,
    background: 'rgba(5,8,13,0.85)',
    border: '1px solid var(--edge-idle)',
    padding: '6px 10px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    color: 'var(--text)',
    display: 'flex' as const,
    gap: 10,
  },
  row: {
    display: 'flex' as const,
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  },
};
