import { useMemo } from 'react';
import type { TokenUsageRow } from '../../api/client';
import { familyOf, type Family, type ModelFamily } from '../../tokens/family';
import { formatTokens } from '../../util/formatTokens';

type Props = {
  rows: TokenUsageRow[];
  projectId: string | 'all';
  cutoffDay: string;
  selected: Family;
  onSelect: (f: Family) => void;
};

const FAMILIES: ModelFamily[] = ['opus', 'sonnet', 'haiku'];

function passes(row: TokenUsageRow, projectId: string | 'all', cutoffDay: string): boolean {
  if (projectId !== 'all' && row.projectId !== projectId) return false;
  if (row.day < cutoffDay) return false;
  return true;
}

function totalOf(row: TokenUsageRow): number {
  return row.input + row.output + row.cached;
}

function versionLabel(modelId: string): string | null {
  const m = modelId.match(/^claude-(?:opus|sonnet|haiku)-(\d+)-(\d+)/i);
  return m ? `${m[1]}.${m[2]}` : null;
}

export function UsageCardsList({ rows, projectId, cutoffDay, selected, onSelect }: Props) {
  const filtered = useMemo(
    () => rows.filter((r) => passes(r, projectId, cutoffDay)),
    [rows, projectId, cutoffDay],
  );

  const grandTotal = useMemo(
    () => filtered.reduce((acc, r) => acc + totalOf(r), 0),
    [filtered],
  );

  const perFamily = useMemo(() => {
    const result = new Map<ModelFamily, { total: number; versions: Set<string> }>();
    for (const r of filtered) {
      const fam = familyOf(r.modelId);
      if (!fam) continue;
      let bucket = result.get(fam);
      if (!bucket) {
        bucket = { total: 0, versions: new Set<string>() };
        result.set(fam, bucket);
      }
      bucket.total += totalOf(r);
      const v = versionLabel(r.modelId);
      if (v) bucket.versions.add(v);
    }
    return result;
  }, [filtered]);

  return (
    <div style={styles.list}>
      <Card
        kind="all"
        title="ALL"
        subtitle="ALL MODELS"
        total={grandTotal}
        pct={100}
        empty={false}
        selected={selected === 'all'}
        onClick={() => onSelect('all')}
      />
      {FAMILIES.map((fam) => {
        const bucket = perFamily.get(fam);
        const total = bucket?.total ?? 0;
        const versions = bucket
          ? [...bucket.versions].sort((a, b) => b.localeCompare(a))
          : [];
        const empty = !bucket || total === 0;
        const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
        return (
          <Card
            key={fam}
            kind={fam}
            title={fam.toUpperCase()}
            subtitle={empty ? '(no data)' : versions.join(' · ')}
            total={total}
            pct={pct}
            empty={empty}
            selected={selected === fam}
            onClick={() => onSelect(fam)}
          />
        );
      })}
    </div>
  );
}

type CardProps = {
  kind: Family;
  title: string;
  subtitle: string;
  total: number;
  pct: number;
  empty: boolean;
  selected: boolean;
  onClick: () => void;
};

function Card({ kind, title, subtitle, total, pct, empty, selected, onClick }: CardProps) {
  return (
    <div
      data-testid={`usage-card-${kind}`}
      data-selected={selected ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
      onClick={onClick}
      style={{
        ...styles.card,
        ...(selected ? styles.cardSelected : null),
        ...(empty ? styles.cardEmpty : null),
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div style={styles.name}>{title}</div>
      <div style={styles.sub}>{subtitle}</div>
      <div style={styles.total}>{formatTokens(total)}</div>
      <div style={styles.barTrack}>
        <div
          data-role="bar"
          data-pct={String(pct)}
          style={{ ...styles.barFill, width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const styles = {
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
    padding: '0 12px 12px',
  },
  card: {
    background: 'rgba(5,8,13,0.6)',
    border: '1px solid rgba(110, 224, 238, 0.55)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    padding: '10px 12px',
    cursor: 'pointer' as const,
    transition: 'all .12s ease',
  },
  cardSelected: {
    background: 'rgba(0,229,255,0.10)',
    borderColor: 'var(--edge-trail)',
    boxShadow: '0 0 12px rgba(0,229,255,0.25)',
  },
  cardEmpty: {
    opacity: 0.55,
  },
  name: { fontSize: 11, letterSpacing: 3, color: 'var(--edge-trail)' },
  sub: { fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 2 },
  total: { fontSize: 14, letterSpacing: 1, color: 'var(--text)', marginTop: 6 },
  barTrack: { height: 3, marginTop: 8, background: 'var(--grid)', position: 'relative' as const },
  barFill: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    background: 'var(--edge-trail)',
    boxShadow: '0 0 6px var(--edge-trail)',
  },
};
