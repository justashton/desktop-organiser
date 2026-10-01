import type { JournalEntry, StatusReport } from './types.js';
import type { RulesStore } from './rules.js';
import { readRules } from './rules.js';

export interface BuildStatusOptions {
  rulesStore: RulesStore;
  journalEntries: JournalEntry[];
  /** Pass the result of scan + propose_plan's `unmatched.length` when available; omit to skip this field. */
  unorganisedFileCount?: number;
}

export async function buildStatus({ rulesStore, journalEntries, unorganisedFileCount }: BuildStatusOptions): Promise<StatusReport> {
  let rulesVersion: number | null = null;
  try {
    const rules = await readRules(rulesStore);
    rulesVersion = rules.version;
  } catch {
    rulesVersion = null;
  }

  const batchIds = new Set(journalEntries.map((e) => e.batchId));
  const lastRunAt = journalEntries.reduce<string | null>((latest, e) => (!latest || e.timestamp > latest ? e.timestamp : latest), null);

  return {
    rulesVersion,
    rulesPath: rulesStore.rulesPath,
    lastRunAt,
    totalBatches: batchIds.size,
    totalMovesAppliedAllTime: journalEntries.filter((e) => !e.undone).length,
    totalMovesUndoneAllTime: journalEntries.filter((e) => e.undone).length,
    unorganisedFileCount: unorganisedFileCount ?? null,
  };
}
