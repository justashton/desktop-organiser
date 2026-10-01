import { describe, expect, it } from 'vitest';
import { scan } from '../src/scan.js';
import { buildNeverTouchMatcher } from '../src/neverTouch.js';
import { makeTempDir, writeFixtureFile } from './helpers.js';

describe('scan', () => {
  it('groups files by extension and excludes never-touch paths', async () => {
    const root = await makeTempDir('organise-scan');
    await writeFixtureFile(root, 'Screenshot 2026-01-01.png', 'x');
    await writeFixtureFile(root, 'Screenshot 2026-01-02.png', 'x');
    await writeFixtureFile(root, 'bank-export.csv', 'Date,Amount,Payee\n2026-01-01,10,Cafe\n');
    await writeFixtureFile(root, 'a-project/.git/HEAD', 'ref: refs/heads/main');
    await writeFixtureFile(root, 'a-project/node_modules/pkg/index.js', 'module.exports = {}');
    await writeFixtureFile(root, '.hidden-config', 'secret');

    const isNeverTouch = buildNeverTouchMatcher([]);
    const result = await scan({ scope: [root], isNeverTouch });

    expect(result.totalFiles).toBe(3); // 2 screenshots + 1 csv; git/node_modules/hidden excluded
    const pngGroup = result.groups.find((g) => g.extension === '.png');
    expect(pngGroup?.count).toBe(2);
    const csvGroup = result.groups.find((g) => g.extension === '.csv');
    expect(csvGroup?.count).toBe(1);
  });

  it('caps examples per group without affecting the reported count', async () => {
    const root = await makeTempDir('organise-scan-many');
    for (let i = 0; i < 10; i += 1) {
      await writeFixtureFile(root, `Screenshot ${i}.png`, 'x');
    }
    const isNeverTouch = buildNeverTouchMatcher([]);
    const result = await scan({ scope: [root], isNeverTouch, examplesPerGroup: 3 });

    const pngGroup = result.groups.find((g) => g.extension === '.png');
    expect(pngGroup?.count).toBe(10);
    expect(pngGroup?.examples.length).toBe(3);
  });
});
