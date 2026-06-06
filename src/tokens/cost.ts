import type { PriceEntry, PriceTable, TokenUsageRow } from '../api/client';
import { modelKey } from './aggregate';

export type CostSplit = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // 5m + 1h combined (prices differ; split happens at computation)
  total: number;
};

export function zeroSplit(): CostSplit {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function addInto(acc: CostSplit, c: CostSplit): void {
  acc.input += c.input;
  acc.output += c.output;
  acc.cacheRead += c.cacheRead;
  acc.cacheWrite += c.cacheWrite;
  acc.total += c.total;
}

export function normalizeModelId(id: string): string {
  return id.replace(/-\d{8}$/, '');
}

function isValidEntry(p: PriceEntry | undefined): p is PriceEntry {
  return p !== undefined
    && Number.isFinite(p.input)
    && Number.isFinite(p.output)
    && Number.isFinite(p.cacheRead)
    && Number.isFinite(p.cacheWrite5m)
    && Number.isFinite(p.cacheWrite1h);
}

export function priceFor(
  modelId: string,
  month: string, // YYYY-MM
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): PriceEntry | null {
  const norm = normalizeModelId(modelId);
  // A hand-edited snapshot entry with missing/non-numeric fields would produce
  // NaN dollar figures downstream — treat it as a miss and fall back.
  const snap = prices[month]?.perMTok[norm];
  if (isValidEntry(snap)) return snap;
  const fallback = bundled.perMTok[norm];
  return isValidEntry(fallback) ? fallback : null;
}

export function costOfRow(
  row: TokenUsageRow,
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): CostSplit | null {
  const p = priceFor(row.modelId, row.day.slice(0, 7), prices, bundled);
  if (!p) return null;
  const tokenSum = row.input + row.output + row.cacheRead + row.cacheWrite5m + row.cacheWrite1h;
  if (!Number.isFinite(tokenSum)) return null; // hand-edited NaN/string token — don't poison totals
  const input = (row.input * p.input) / 1e6;
  const output = (row.output * p.output) / 1e6;
  const cacheRead = (row.cacheRead * p.cacheRead) / 1e6;
  const cacheWrite = (row.cacheWrite5m * p.cacheWrite5m + row.cacheWrite1h * p.cacheWrite1h) / 1e6;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}

export type CostSummary = {
  total: CostSplit;
  byModel: Map<string, CostSplit>; // keyed by modelKey(modelId, isSubagent)
  unpricedTokens: number;
  unpricedModels: string[]; // unique raw model ids, sorted
};

export function costSummary(
  rows: TokenUsageRow[],
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): CostSummary {
  const total = zeroSplit();
  const byModel = new Map<string, CostSplit>();
  let unpricedTokens = 0;
  const unpriced = new Set<string>();
  for (const r of rows) {
    const c = costOfRow(r, prices, bundled);
    if (!c) {
      const t = r.input + r.output + r.cacheRead + r.cacheWrite5m + r.cacheWrite1h;
      unpricedTokens += Number.isFinite(t) ? t : 0;
      unpriced.add(r.modelId);
      continue;
    }
    addInto(total, c);
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = byModel.get(k);
    if (prev) addInto(prev, c);
    else byModel.set(k, { ...c });
  }
  return { total, byModel, unpricedTokens, unpricedModels: Array.from(unpriced).sort() };
}

export type MonthCost = {
  month: string; // YYYY-MM
  total: CostSplit;
  byModel: Map<string, CostSplit>;
};

export function costByMonth(
  rows: TokenUsageRow[],
  prices: Record<string, PriceTable>,
  bundled: PriceTable,
): MonthCost[] {
  const months = new Map<string, MonthCost>();
  for (const r of rows) {
    const c = costOfRow(r, prices, bundled);
    if (!c) continue; // unpriced rows are surfaced via costSummary, not here
    const month = r.day.slice(0, 7);
    let slot = months.get(month);
    if (!slot) {
      slot = { month, total: zeroSplit(), byModel: new Map() };
      months.set(month, slot);
    }
    addInto(slot.total, c);
    const k = modelKey(r.modelId, r.isSubagent);
    const prev = slot.byModel.get(k);
    if (prev) addInto(prev, c);
    else slot.byModel.set(k, { ...c });
  }
  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function modelKeysByCost(months: MonthCost[]): string[] {
  const totals = new Map<string, number>();
  for (const m of months) {
    for (const [k, c] of m.byModel) totals.set(k, (totals.get(k) ?? 0) + c.total);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
