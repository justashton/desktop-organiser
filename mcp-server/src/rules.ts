import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { DEFAULT_NEVER_TOUCH } from './neverTouch.js';
import type { OrganiseRules } from './types.js';

const ruleMatchSchema = z
  .object({
    extension: z.array(z.string()).optional(),
    name_pattern: z.string().optional(),
    content_hint: z.string().optional(),
    source_folder: z.string().optional(),
    keyword_in: z.string().optional(),
  })
  .refine((m) => Object.keys(m).length > 0, {
    message: 'A rule match must specify at least one condition.',
  });

const organiseRulesSchema = z.object({
  version: z.number().int().nonnegative(),
  scope: z.array(z.string()).min(1, 'scope must list at least one directory'),
  projects: z
    .array(
      z.object({
        name: z.string().min(1),
        aliases: z.array(z.string()).default([]),
        root: z.string().min(1),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  rules: z
    .array(
      z.object({
        match: ruleMatchSchema,
        destination: z.string().min(1),
        rename: z.string().optional(),
      }),
    )
    .default([]),
  naming: z
    .object({
      date_format: z.string().default('YYYY-MM-DD'),
      collision: z.literal('suffix').default('suffix'),
    })
    .default({ date_format: 'YYYY-MM-DD', collision: 'suffix' }),
  never_touch: z.array(z.string()).default([]),
  quarantine: z
    .object({
      path: z.string().min(1),
      hold_days: z.number().int().positive().default(30),
    })
    .default({ path: '~/.desktop-organiser/quarantine', hold_days: 30 }),
  notes: z.string().optional(),
});

export class RulesValidationError extends Error {}

/** Splits an `ORGANISE.md` document into its YAML front matter and trailing notes body. */
function splitFrontMatter(raw: string): { frontMatter: string; notes: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new RulesValidationError('ORGANISE.md must start with a YAML front-matter block delimited by `---`.');
  }
  // Strip a leading "## Notes" heading if present, so parse -> serialise is a
  // stable round trip instead of accumulating nested headings each time.
  const notes = match[2].trim().replace(/^##\s*Notes\s*\n+/i, '');
  return { frontMatter: match[1], notes };
}

export function parseRules(raw: string): OrganiseRules {
  const { frontMatter, notes } = splitFrontMatter(raw);

  let parsedYaml: unknown;
  try {
    parsedYaml = YAML.parse(frontMatter);
  } catch (err) {
    throw new RulesValidationError(`ORGANISE.md front matter is not valid YAML: ${(err as Error).message}`);
  }

  const result = organiseRulesSchema.safeParse(parsedYaml);
  if (!result.success) {
    throw new RulesValidationError(`ORGANISE.md failed validation: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  // never_touch in a rules file is additive to the built-in defaults — it can
  // never remove protection the engine ships with.
  const mergedNeverTouch = Array.from(new Set([...DEFAULT_NEVER_TOUCH, ...result.data.never_touch]));

  return { ...result.data, never_touch: mergedNeverTouch, notes: notes || undefined };
}

export function serialiseRules(rules: OrganiseRules): string {
  // Only persist the user-authored never_touch entries, not the merged-in
  // defaults, so re-reading the file doesn't duplicate them on every write.
  const userNeverTouch = rules.never_touch.filter((p) => !DEFAULT_NEVER_TOUCH.includes(p));
  const { notes, never_touch: _never_touch, ...rest } = rules;
  const frontMatter = YAML.stringify({ ...rest, never_touch: userNeverTouch });
  const notesBlock = notes ? `\n## Notes\n\n${notes}\n` : '';
  return `---\n${frontMatter}---\n${notesBlock}`;
}

export interface RulesStore {
  rulesPath: string;
  versionsDir: string;
}

export function defaultRulesStore(home = process.env.HOME ?? process.env.USERPROFILE ?? '.'): RulesStore {
  const base = path.join(home, '.desktop-organiser');
  return { rulesPath: path.join(base, 'ORGANISE.md'), versionsDir: path.join(base, 'versions') };
}

export async function readRules(store: RulesStore): Promise<OrganiseRules> {
  const raw = await readFile(store.rulesPath, 'utf8');
  return parseRules(raw);
}

/**
 * Validates and writes a new ORGANISE.md, keeping the previous version under
 * `versions/` so a bad rules change can always be rolled back (per the spec's
 * versioning section). Never silently overwrites a file that fails to parse.
 */
export async function writeRules(store: RulesStore, next: OrganiseRules): Promise<{ versionArchived: string | null }> {
  // Validate round-trip before touching disk: serialise then re-parse.
  const serialised = serialiseRules(next);
  parseRules(serialised);

  await mkdir(path.dirname(store.rulesPath), { recursive: true });
  await mkdir(store.versionsDir, { recursive: true });

  let versionArchived: string | null = null;
  try {
    const previousRaw = await readFile(store.rulesPath, 'utf8');
    const previous = parseRules(previousRaw);
    const archivePath = path.join(store.versionsDir, `ORGANISE.v${previous.version}.${Date.now()}.md`);
    await rename(store.rulesPath, archivePath);
    versionArchived = archivePath;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  await writeFile(store.rulesPath, serialised, 'utf8');
  return { versionArchived };
}
