import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JournalEntry } from './types.js';

export interface JournalStore {
  path: string;
}

export function defaultJournalStore(home = process.env.HOME ?? process.env.USERPROFILE ?? '.'): JournalStore {
  return { path: path.join(home, '.desktop-organiser', 'journal.jsonl') };
}

/** Appends entries to the journal. Never truncates or rewrites existing lines — append-only, per the safety spec. */
export async function appendJournalEntries(store: JournalStore, entries: JournalEntry[]): Promise<void> {
  await mkdir(path.dirname(store.path), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await appendFile(store.path, lines, 'utf8');
}

export async function readJournal(store: JournalStore): Promise<JournalEntry[]> {
  let raw: string;
  try {
    raw = await readFile(store.path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournalEntry);
}

export async function readBatch(store: JournalStore, batchId: string): Promise<JournalEntry[]> {
  const all = await readJournal(store);
  return all.filter((e) => e.batchId === batchId);
}

export async function latestBatchId(store: JournalStore): Promise<string | null> {
  const all = await readJournal(store);
  if (all.length === 0) {
    return null;
  }
  return all[all.length - 1].batchId;
}

/**
 * Marks journal entries as undone by appending reversal-aware copies. The
 * journal itself is append-only; "marking undone" means every future read
 * sees the latest state for that (batchId, source, destination) triple.
 */
export async function markUndone(store: JournalStore, batchId: string, sources: string[]): Promise<void> {
  const entries = await readBatch(store, batchId);
  const toMark = entries.filter((e) => sources.includes(e.source) && !e.undone);
  const updated = toMark.map((e) => ({ ...e, undone: true }));
  if (updated.length > 0) {
    await appendJournalEntries(store, updated);
  }
}

/** Collapses the journal to the latest entry per (batchId, source) so undo state is a simple lookup. */
export function latestStatePerMove(entries: JournalEntry[]): JournalEntry[] {
  const byKey = new Map<string, JournalEntry>();
  for (const entry of entries) {
    byKey.set(`${entry.batchId}:${entry.source}`, entry);
  }
  return Array.from(byKey.values());
}
