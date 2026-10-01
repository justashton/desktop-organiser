import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JournalEntry, QuarantineConfig } from './types.js';
import { appendJournalEntries, type JournalStore } from './journal.js';
import { moveFile, uniqueDestination } from './fsMove.js';

export interface QuarantineResult {
  batchId: string;
  quarantined: { source: string; destination: string }[];
  failed: { source: string; error: string }[];
  holdUntil: string;
}

function expandHome(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
  return p === '~' ? home : p.startsWith('~/') ? path.join(home, p.slice(2)) : p;
}

/**
 * Moves files into a dated quarantine folder instead of deleting them. The
 * engine has no delete tool at all — emptying quarantine is a manual, human
 * decision, made outside this tool, after the hold period.
 */
export async function quarantine(
  files: string[],
  config: QuarantineConfig,
  journalStore: JournalStore,
): Promise<QuarantineResult> {
  const dateFolder = new Date().toISOString().slice(0, 10);
  const quarantineRoot = path.join(expandHome(config.path), dateFolder);
  await mkdir(quarantineRoot, { recursive: true });

  const batchId = randomUUID();
  const quarantined: QuarantineResult['quarantined'] = [];
  const failed: QuarantineResult['failed'] = [];

  for (const source of files) {
    try {
      const candidate = path.join(quarantineRoot, path.basename(source));
      const destination = await uniqueDestination(candidate);
      const entry: JournalEntry = {
        batchId,
        timestamp: new Date().toISOString(),
        source,
        destination,
        sizeBytes: 0,
        signature: 'quarantine',
        undone: false,
      };
      await appendJournalEntries(journalStore, [entry]);
      await moveFile(source, destination);
      quarantined.push({ source, destination });
    } catch (err) {
      failed.push({ source, error: (err as Error).message });
    }
  }

  const holdUntil = new Date(Date.now() + config.hold_days * 24 * 60 * 60 * 1000).toISOString();

  const manifestPath = path.join(quarantineRoot, '.quarantine-manifest.json');
  await writeFile(manifestPath, JSON.stringify({ batchId, holdUntil, items: quarantined }, null, 2), 'utf8');

  return { batchId, quarantined, failed, holdUntil };
}
