import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPlan, BATCH_CONFIRMATION_THRESHOLD, LargeBatchError } from '../src/apply.js';
import { defaultJournalStore, readJournal } from '../src/journal.js';
import { undo } from '../src/undo.js';
import type { Plan } from '../src/types.js';
import { makeTempDir, writeFixtureFile } from './helpers.js';

function plan(moves: Plan['moves']): Plan {
  return { planId: 'test-plan', createdAt: new Date().toISOString(), rulesVersion: 1, moves, unmatched: [], skipped: [] };
}

describe('applyPlan + undo', () => {
  it('moves a file, journals it, and can undo it back', async () => {
    const home = await makeTempDir('organise-apply-home');
    const sourceRoot = await makeTempDir('organise-apply-src');
    const journalStore = defaultJournalStore(home);

    const source = await writeFixtureFile(sourceRoot, 'Screenshot.png', 'image-bytes');
    const destination = path.join(sourceRoot, 'Screenshots', 'Screenshot.png');

    const result = await applyPlan({ plan: plan([{ source, destination, reason: { type: 'rule', ruleIndex: 0 } }]), journalStore });

    expect(result.applied).toEqual([{ source, destination }]);
    await expect(readFile(destination, 'utf8')).resolves.toBe('image-bytes');

    const undoResult = await undo({ journalStore, batchId: result.batchId });
    expect(undoResult.reverted).toEqual([{ source, destination }]);
    await expect(readFile(source, 'utf8')).resolves.toBe('image-bytes');
  });

  it('never overwrites an existing file at the destination; appends a numeric suffix instead', async () => {
    const home = await makeTempDir('organise-apply-home-collision');
    const sourceRoot = await makeTempDir('organise-apply-src-collision');
    const journalStore = defaultJournalStore(home);

    const destDir = path.join(sourceRoot, 'dest');
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, 'invoice.pdf'), 'existing-file', 'utf8');

    const source = await writeFixtureFile(sourceRoot, 'invoice.pdf', 'new-file');
    const destination = path.join(destDir, 'invoice.pdf');

    const result = await applyPlan({ plan: plan([{ source, destination, reason: { type: 'rule', ruleIndex: 0 } }]), journalStore });

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].destination).toBe(path.join(destDir, 'invoice-2.pdf'));
    await expect(readFile(path.join(destDir, 'invoice.pdf'), 'utf8')).resolves.toBe('existing-file');
    await expect(readFile(path.join(destDir, 'invoice-2.pdf'), 'utf8')).resolves.toBe('new-file');
  });

  it('reports a failed move without aborting the rest of the batch', async () => {
    const home = await makeTempDir('organise-apply-home-missing');
    const journalStore = defaultJournalStore(home);

    const missingSource = '/does/not/exist/file.txt';
    const result = await applyPlan({
      plan: plan([{ source: missingSource, destination: '/tmp/wherever.txt', reason: { type: 'rule', ruleIndex: 0 } }]),
      journalStore,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.failed).toEqual([{ source: missingSource, destination: '/tmp/wherever.txt', error: 'Source file no longer exists.' }]);
  });

  it('refuses a plan over the batch threshold without explicit confirmation', async () => {
    const home = await makeTempDir('organise-apply-home-large');
    const journalStore = defaultJournalStore(home);
    const moves = Array.from({ length: BATCH_CONFIRMATION_THRESHOLD + 1 }, (_, i) => ({
      source: `/tmp/src-${i}.txt`,
      destination: `/tmp/dst-${i}.txt`,
      reason: { type: 'rule' as const, ruleIndex: 0 },
    }));

    await expect(applyPlan({ plan: plan(moves), journalStore })).rejects.toThrow(LargeBatchError);
  });

  it('reports a conflict on undo when the original location is now occupied, without overwriting it', async () => {
    const home = await makeTempDir('organise-apply-home-undo-conflict');
    const sourceRoot = await makeTempDir('organise-apply-src-undo-conflict');
    const journalStore = defaultJournalStore(home);

    const source = await writeFixtureFile(sourceRoot, 'report.csv', 'original');
    const destination = path.join(sourceRoot, 'Finance', 'report.csv');
    const result = await applyPlan({ plan: plan([{ source, destination, reason: { type: 'rule', ruleIndex: 0 } }]), journalStore });

    // Something new now sits at the original path.
    await writeFile(source, 'a different file entirely', 'utf8');

    const undoResult = await undo({ journalStore, batchId: result.batchId });
    expect(undoResult.reverted).toHaveLength(0);
    expect(undoResult.conflicts).toHaveLength(1);
    await expect(readFile(source, 'utf8')).resolves.toBe('a different file entirely');
    await expect(readFile(destination, 'utf8')).resolves.toBe('original');
  });

  it('journals every move before performing the filesystem operation', async () => {
    const home = await makeTempDir('organise-apply-home-journal');
    const sourceRoot = await makeTempDir('organise-apply-src-journal');
    const journalStore = defaultJournalStore(home);

    const source = await writeFixtureFile(sourceRoot, 'a.txt', 'a');
    const destination = path.join(sourceRoot, 'b.txt');
    await applyPlan({ plan: plan([{ source, destination, reason: { type: 'rule', ruleIndex: 0 } }]), journalStore });

    const entries = await readJournal(journalStore);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe(source);
    expect(entries[0].destination).toBe(destination);
    expect(entries[0].undone).toBe(false);
  });
});
