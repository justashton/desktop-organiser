import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { quarantine } from '../src/quarantine.js';
import { defaultJournalStore } from '../src/journal.js';
import { makeTempDir, writeFixtureFile } from './helpers.js';

describe('quarantine', () => {
  it('moves files into a dated quarantine folder and records a hold-until date, never deleting them', async () => {
    const home = await makeTempDir('organise-quarantine-home');
    const sourceRoot = await makeTempDir('organise-quarantine-src');
    const journalStore = defaultJournalStore(home);

    const file = await writeFixtureFile(sourceRoot, 'junk.tmp', 'junk');
    const quarantinePath = path.join(home, 'quarantine');

    const result = await quarantine([file], { path: quarantinePath, hold_days: 30 }, journalStore);

    expect(result.quarantined).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(new Date(result.holdUntil).getTime()).toBeGreaterThan(Date.now());

    const movedContents = await readFile(result.quarantined[0].destination, 'utf8');
    expect(movedContents).toBe('junk');
  });
});
