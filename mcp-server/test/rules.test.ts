import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { parseRules, RulesValidationError, readRules, writeRules, defaultRulesStore } from '../src/rules.js';
import { makeTempDir } from './helpers.js';

const VALID_DOC = `---
version: 1
scope:
  - ~/Desktop
projects:
  - name: Addison
    aliases: [addison]
    root: ~/Projects/addison
    keywords: [addison]
rules:
  - match:
      extension: [.png]
    destination: ~/Pictures/Screenshots
never_touch:
  - "**/.secret/**"
quarantine:
  path: ~/.desktop-organiser/quarantine
  hold_days: 30
---

## Notes

Some free text.
`;

describe('parseRules', () => {
  it('parses a valid ORGANISE.md document', () => {
    const rules = parseRules(VALID_DOC);
    expect(rules.version).toBe(1);
    expect(rules.projects[0].name).toBe('Addison');
    expect(rules.notes).toBe('Some free text.');
  });

  it('merges user never_touch entries with the built-in defaults, never replacing them', () => {
    const rules = parseRules(VALID_DOC);
    expect(rules.never_touch).toContain('**/.git/**');
    expect(rules.never_touch).toContain('**/.secret/**');
  });

  it('rejects a document with no front matter', () => {
    expect(() => parseRules('just some markdown')).toThrow(RulesValidationError);
  });

  it('rejects a document missing a required field', () => {
    const bad = '---\nversion: 1\n---\n';
    expect(() => parseRules(bad)).toThrow(RulesValidationError);
  });

  it('rejects invalid YAML without crashing', () => {
    const bad = '---\nversion: [1\n---\n';
    expect(() => parseRules(bad)).toThrow(RulesValidationError);
  });
});

describe('writeRules / readRules', () => {
  it('writes, reads back, and archives the previous version on the next write', async () => {
    const home = await makeTempDir('organise-rules');
    const store = defaultRulesStore(home);

    const v1 = parseRules(VALID_DOC);
    const first = await writeRules(store, v1);
    expect(first.versionArchived).toBeNull(); // nothing to archive yet

    const readBack = await readRules(store);
    expect(readBack.version).toBe(1);

    const v2 = { ...readBack, version: 2 };
    const second = await writeRules(store, v2);
    expect(second.versionArchived).not.toBeNull();
    expect(path.basename(second.versionArchived!)).toMatch(/^ORGANISE\.v1\./);

    const finalRead = await readRules(store);
    expect(finalRead.version).toBe(2);
  });

  it('refuses to write a rules object that fails validation', async () => {
    const home = await makeTempDir('organise-rules-invalid');
    const store = defaultRulesStore(home);
    // @ts-expect-error -- intentionally invalid: scope must be non-empty
    const invalid = { ...parseRules(VALID_DOC), scope: [] };
    await expect(writeRules(store, invalid)).rejects.toThrow();
  });
});
