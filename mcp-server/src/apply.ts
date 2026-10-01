import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { ApplyResult, JournalEntry, Plan } from './types.js';
import { appendJournalEntries, type JournalStore } from './journal.js';
import { moveFile, uniqueDestination } from './fsMove.js';

export const BATCH_CONFIRMATION_THRESHOLD = 500;

export class LargeBatchError extends Error {
  constructor(public readonly moveCount: number) {
    super(`Plan has ${moveCount} moves, which is over the ${BATCH_CONFIRMATION_THRESHOLD}-move confirmation threshold. Re-run apply with confirmLargeBatch: true once the user has explicitly confirmed.`);
  }
}

export class StalePlanError extends Error {
  constructor(planId: string) {
    super(`Plan ${planId} was not produced by propose_plan in this session. apply only executes plans returned by propose_plan.`);
  }
}

export interface ApplyOptions {
  plan: Plan;
  journalStore: JournalStore;
  /** Required when `plan.moves.length > BATCH_CONFIRMATION_THRESHOLD`. */
  confirmLargeBatch?: boolean;
}

/**
 * Executes a plan's moves one file at a time, journaling each one before the
 * filesystem operation so a crash mid-batch still leaves an accurate record.
 * Never overwrites an existing file; a collision gets a suffixed name instead.
 */
export async function applyPlan({ plan, journalStore, confirmLargeBatch }: ApplyOptions): Promise<ApplyResult> {
  if (plan.moves.length > BATCH_CONFIRMATION_THRESHOLD && !confirmLargeBatch) {
    throw new LargeBatchError(plan.moves.length);
  }

  const batchId = randomUUID();
  const applied: ApplyResult['applied'] = [];
  const failed: ApplyResult['failed'] = [];

  for (const move of plan.moves) {
    let fileStat;
    try {
      fileStat = await stat(move.source);
    } catch {
      failed.push({ source: move.source, destination: move.destination, error: 'Source file no longer exists.' });
      continue;
    }

    let destination: string;
    try {
      destination = await uniqueDestination(move.destination);
    } catch (err) {
      failed.push({ source: move.source, destination: move.destination, error: (err as Error).message });
      continue;
    }

    const entry: JournalEntry = {
      batchId,
      timestamp: new Date().toISOString(),
      source: move.source,
      destination,
      sizeBytes: fileStat.size,
      signature: plan.planId,
      undone: false,
    };

    // Journal before the side effect: a crash after this line still leaves a
    // true record (file never moved); a crash after the move but before the
    // function returns is recoverable because the entry already exists.
    await appendJournalEntries(journalStore, [entry]);

    try {
      await moveFile(move.source, destination);
      applied.push({ source: move.source, destination });
    } catch (err) {
      failed.push({ source: move.source, destination, error: (err as Error).message });
    }
  }

  return { batchId, applied, failed };
}
