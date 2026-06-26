import type { TokenUsageRow } from '../api/client';

export function cachedOf(r: TokenUsageRow): number {
  return r.cacheRead + r.cacheWrite5m + r.cacheWrite1h;
}

export type RangePreset = '7d' | '30d' | '90d' | 'all';
export type Metric = 'total' | 'input' | 'output' | 'cached';

export function modelKey(modelId: string, isSubagent: boolean): string {
  return isSubagent ? `${modelId}|sub` : modelId;
}

export function presetCutoff(preset: RangePreset, today: string): string {
  if (preset === 'all') return '0000-01-01';
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const t = new Date(`${today}T00:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

export function filterRows(
  rows: TokenUsageRow[],
  projectId: string | 'all',
  cutoffDay: string,
): TokenUsageRow[] {
  return rows.filter((r) => {
    if (projectId !== 'all' && r.projectId !== projectId) return false;
    if (r.day < cutoffDay) return false;
    return true;
  });
}

export function densifyDays(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function modelKeysSorted(rows: TokenUsageRow[]): string[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const k = modelKey(r.modelId, r.isSubagent);
    totals.set(k, (totals.get(k) ?? 0) + r.input + r.output + cachedOf(r));
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function metricValue(r: TokenUsageRow, m: Metric): number {
  if (m === 'input') return r.input;
  if (m === 'output') return r.output;
  if (m === 'cached') return cachedOf(r);
  return r.input + r.output + cachedOf(r);
}

export type DayRow = { day: string; values: Record<string, number> };

export function stackData(
  rows: TokenUsageRow[],
  days: string[],
  keys: string[],
  metric: Metric,
): DayRow[] {
  const dayMap = new Map<string, DayRow>();
  for (const d of days) {
    const values: Record<string, number> = {};
    for (const k of keys) values[k] = 0;
    dayMap.set(d, { day: d, values });
  }
  for (const r of rows) {
    const slot = dayMap.get(r.day);
    if (!slot) continue;
    const k = modelKey(r.modelId, r.isSubagent);
    if (!(k in slot.values)) continue;
    slot.values[k] += metricValue(r, metric);
  }
  return days.map((d) => dayMap.get(d)!);
}

// Per-day stack keyed by the four fixed token types (cacheWrite folds 5m+1h).
// Used by the daily chart's TOTAL view so the stack shows token composition
// instead of per-model bars (which look identical to CACHED — cache reads
// dominate volume).
export function stackDataByType(rows: TokenUsageRow[], days: string[]): DayRow[] {
  const dayMap = new Map<string, DayRow>();
  for (const d of days) {
    dayMap.set(d, { day: d, values: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
  }
  for (const r of rows) {
    const slot = dayMap.get(r.day);
    if (!slot) continue;
    slot.values.input += r.input;
    slot.values.output += r.output;
    slot.values.cacheRead += r.cacheRead;
    slot.values.cacheWrite += r.cacheWrite5m + r.cacheWrite1h;
  }
  return days.map((d) => dayMap.get(d)!);
}

export type ModelSummary = {
  modelId: string;
  isSubagent: boolean;
  input: number;
  output: number;
  cached: number;
  total: number;
};

export function summariesPerModel(rows: TokenUsageRow[]): ModelSummary[] {
  const acc = new Map<string, ModelSummary>();
  for (const r of rows) {
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = acc.get(k);
    if (prev) {
      prev.input += r.input;
      prev.output += r.output;
      prev.cached += cachedOf(r);
      prev.total = prev.input + prev.output + prev.cached;
    } else {
      acc.set(k, {
        modelId: r.modelId,
        isSubagent: r.isSubagent,
        input: r.input,
        output: r.output,
        cached: cachedOf(r),
        total: r.input + r.output + cachedOf(r),
      });
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.total - a.total);
}
