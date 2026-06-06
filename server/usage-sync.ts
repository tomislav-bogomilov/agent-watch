import { aggregateTokenUsage } from './aggregate-token-usage';
import type { TokenUsageProject, TokenUsageRow } from './aggregate-token-usage';
import { mergeHistory, readHistory, writeHistory } from './usage-history-store';
import { BUNDLED_PRICES, ensureMonthSnapshot, loadPriceSnapshots } from './model-pricing';
import type { PriceTable } from './model-pricing';

export type TokenUsagePayload = {
  projects: TokenUsageProject[]; // live dirs ∪ history projects map
  rows: TokenUsageRow[];         // merged history ∪ fresh
  prices: Record<string, PriceTable>; // 'YYYY-MM' -> snapshot
  bundledPrices: PriceTable;          // fallback for months without a snapshot
  unsyncedWarning?: string;           // set when this round's persistence failed
};

export async function syncTokenUsage(
  claudeRoot: string,
  usageDir: string,
  now: Date = new Date(),
): Promise<TokenUsagePayload> {
  const fresh = await aggregateTokenUsage(claudeRoot);
  const history = await readHistory(usageDir);
  const merged = mergeHistory(history, fresh, now.toISOString());

  let unsyncedWarning: string | undefined;
  try {
    await writeHistory(usageDir, merged);
  } catch (err) {
    unsyncedWarning = `usage history not persisted: ${(err as Error).message}`;
    console.warn(`[thoughtgraph] ${unsyncedWarning}`);
  }

  try {
    await ensureMonthSnapshot(usageDir, now.toISOString().slice(0, 7));
  } catch (err) {
    console.warn(`[thoughtgraph] price snapshot failed: ${(err as Error).message}`);
  }

  const prices = await loadPriceSnapshots(usageDir);
  const projects: TokenUsageProject[] = Object.entries(merged.projects)
    .map(([id, cwd]) => ({ id, cwd }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    projects,
    rows: merged.rows,
    prices,
    bundledPrices: BUNDLED_PRICES,
    ...(unsyncedWarning ? { unsyncedWarning } : {}),
  };
}
