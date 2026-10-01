import { stat } from 'node:fs/promises';
import type { UndoResult } from './types.js';
import { latestStatePerMove, markUndone, readBatch, type JournalStore } from './journal.js';
import { moveFile } from './fsMove.js';

export class UnknownBatchError extends Error {
  constructor(batchId: string) {
    super(`No journal entries found for batch ${batchId}.`);
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export interface UndoOptions {
  journalStore: JournalStore;
  batchId: string;
  /** Limits the undo to specific source paths within the batch; omit to undo the whole batch. */
  sources?: string[];
}

/**
 * Reverts a batch (or a subset of it) by moving files back to their original
 * source path. Never overwrites: if something now occupies the original
 * source path, that move is reported as a conflict and left untouched.
 */
export async function undo({ journalStore, batchId, sources }: UndoOptions): Promise<UndoResult> {
  const batchEntries = await readBatch(journalStore, batchId);
  if (batchEntries.length === 0) {
    throw new UnknownBatchError(batchId);
  }

  const latest = latestStatePerMove(batchEntries).filter((e) => !e.undone);
  const toRevert = sources ? latest.filter((e) => sources.includes(e.source)) : latest;

  const reverted: UndoResult['reverted'] = [];
  const conflicts: UndoResult['conflicts'] = [];

  for (const entry of toRevert) {
    const destinationStillThere = await pathExists(entry.destination);
    if (!destinationStillThere) {
      conflicts.push({ source: entry.source, destination: entry.destination, reason: 'File is no longer at its organised location (moved or renamed since).' });
      continue;
    }
    if (await pathExists(entry.source)) {
      conflicts.push({ source: entry.source, destination: entry.destination, reason: 'Original location is occupied by another file; not overwriting.' });
      continue;
    }

    await moveFile(entry.destination, entry.source);
    reverted.push({ source: entry.source, destination: entry.destination });
  }

  if (reverted.length > 0) {
    await markUndone(journalStore, batchId, reverted.map((r) => r.source));
  }

  return { batchId, reverted, conflicts };
}
