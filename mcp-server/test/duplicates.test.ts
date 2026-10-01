import { describe, expect, it } from 'vitest';
import { findDuplicates } from '../src/duplicates.js';
import { makeTempDir, writeFixtureFile } from './helpers.js';
import type { FileEntry } from '../src/types.js';

function entry(p: string, sizeBytes: number): FileEntry {
  return { path: p, name: p.split('/').pop()!, extension: '', sizeBytes, modifiedAt: new Date().toISOString(), sourceFolder: '', signature: '' };
}

describe('findDuplicates', () => {
  it('flags two files with identical content as duplicates', async () => {
    const dir = await makeTempDir('organise-dupes');
    const a = await writeFixtureFile(dir, 'a.txt', 'identical contents');
    const b = await writeFixtureFile(dir, 'b.txt', 'identical contents');
    const c = await writeFixtureFile(dir, 'c.txt', 'different contents');

    const groups = await findDuplicates([entry(a, 19), entry(b, 19), entry(c, 19)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].paths.sort()).toEqual([a, b].sort());
  });

  it('skips hashing when no two files share a size', async () => {
    const dir = await makeTempDir('organise-dupes-unique');
    const a = await writeFixtureFile(dir, 'a.txt', 'short');
    const b = await writeFixtureFile(dir, 'b.txt', 'a much longer file body');

    const groups = await findDuplicates([entry(a, 5), entry(b, 24)]);
    expect(groups).toHaveLength(0);
  });
});
