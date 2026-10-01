import { describe, expect, it } from 'vitest';
import { proposePlan } from '../src/plan.js';
import { parseRules } from '../src/rules.js';
import type { FileEntry } from '../src/types.js';

const RULES_DOC = `---
version: 1
scope:
  - ~/Desktop
projects:
  - name: Addison
    aliases: [addison]
    root: ~/Projects/addison
    keywords: [clinician]
rules:
  - match:
      extension: [.png]
      name_pattern: "^Screenshot"
    destination: ~/Pictures/Screenshots/{year}-{month}
  - match:
      keyword_in: Addison
    destination: ~/Projects/addison/inbox
  - match:
      extension: [.csv]
      content_hint: "Date,Amount,Payee"
    destination: ~/Finance/Bank/{year}
quarantine:
  path: ~/.desktop-organiser/quarantine
  hold_days: 30
---
`;

function file(overrides: Partial<FileEntry>): FileEntry {
  return {
    path: '/home/user/Desktop/placeholder',
    name: 'placeholder',
    extension: '',
    sizeBytes: 1,
    modifiedAt: '2026-03-15T00:00:00.000Z',
    sourceFolder: '/home/user/Desktop',
    signature: 'sig',
    ...overrides,
  };
}

describe('proposePlan', () => {
  it('matches a screenshot by extension + name pattern and fills {year}/{month}', async () => {
    const rules = parseRules(RULES_DOC);
    const f = file({ path: '/home/user/Desktop/Screenshot 2026-03-15.png', name: 'Screenshot 2026-03-15.png', extension: '.png' });
    const plan = await proposePlan({ rules, files: [f] });

    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].destination).toContain('Screenshots/2026-03');
    expect(plan.moves[0].reason).toEqual({ type: 'rule', ruleIndex: 0 });
  });

  it('matches a project by alias appearing in the filename (keyword_in)', async () => {
    const rules = parseRules(RULES_DOC);
    const f = file({ path: '/home/user/Desktop/addison-invoice.pdf', name: 'addison-invoice.pdf', extension: '.pdf' });
    const plan = await proposePlan({ rules, files: [f] });

    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].destination).toContain('Projects/addison/inbox');
  });

  it('uses the first matching rule, not the most specific one', async () => {
    const rules = parseRules(RULES_DOC);
    // Matches rule 0 (screenshot) even though it would also match a hypothetical later rule.
    const f = file({ path: '/home/user/Desktop/Screenshot addison.png', name: 'Screenshot addison.png', extension: '.png' });
    const plan = await proposePlan({ rules, files: [f] });

    expect(plan.moves[0].reason).toEqual({ type: 'rule', ruleIndex: 0 });
  });

  it('puts files that match no rule into unmatched', async () => {
    const rules = parseRules(RULES_DOC);
    const f = file({ path: '/home/user/Desktop/random.docx', name: 'random.docx', extension: '.docx' });
    const plan = await proposePlan({ rules, files: [f] });

    expect(plan.moves).toHaveLength(0);
    expect(plan.unmatched).toEqual([f.path]);
  });

  it('matches a CSV by content hint (header row)', async () => {
    const root = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = await root.mkdtemp(path.join(os.tmpdir(), 'organise-plan-csv-'));
    const csvPath = path.join(dir, 'export.csv');
    await root.writeFile(csvPath, 'Date,Amount,Payee\n2026-01-01,12.50,Cafe\n', 'utf8');

    const rules = parseRules(RULES_DOC);
    const f = file({ path: csvPath, name: 'export.csv', extension: '.csv', sourceFolder: dir });
    const plan = await proposePlan({ rules, files: [f] });

    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].destination).toContain('Finance/Bank/2026');
  });
});
