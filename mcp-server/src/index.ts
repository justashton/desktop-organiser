#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { applyPlan, LargeBatchError, StalePlanError } from './apply.js';
import { classify } from './classify.js';
import { findDuplicates } from './duplicates.js';
import { buildNeverTouchMatcher } from './neverTouch.js';
import { defaultJournalStore, readJournal } from './journal.js';
import { proposePlan } from './plan.js';
import { quarantine } from './quarantine.js';
import { defaultRulesStore, parseRules, readRules, writeRules } from './rules.js';
import { scan } from './scan.js';
import { buildStatus } from './status.js';
import type { FileEntry, OrganiseRules, Plan } from './types.js';
import { undo } from './undo.js';

const rulesStore = defaultRulesStore();
const journalStore = defaultJournalStore();

/**
 * Plans are kept in-memory, keyed by planId, so `apply` can refuse to run
 * anything that wasn't just returned by `propose_plan` in this session —
 * the "dry run by default" safety requirement.
 */
const sessionPlans = new Map<string, Plan>();

/** Full scans are cached per session so `apply`/`status` don't have to re-walk the filesystem. */
let lastScanFiles: FileEntry[] = [];

const server = new McpServer({ name: 'desktop-organiser', version: '0.1.0' });

server.registerTool(
  'scan',
  {
    description:
      "Lists files under the rules file's scope (or an override) with size, dates, type, and a lightweight signature. Read-only. Results are grouped and truncated so large folders stay cheap to reason about.",
    inputSchema: {
      scopeOverride: z.array(z.string()).optional().describe('Directories to scan instead of the rules file scope.'),
    },
  },
  async ({ scopeOverride }) => {
    const rules = await readRules(rulesStore).catch(() => null);
    const scope = scopeOverride ?? rules?.scope ?? ['~/Desktop', '~/Downloads'];
    const isNeverTouch = buildNeverTouchMatcher(rules?.never_touch ?? []);
    const result = await scan({ scope, isNeverTouch });
    lastScanFiles = result.groups.flatMap((g) => g.examples);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'classify',
  {
    description:
      'Returns a minimal content hint for one file: CSV headers, first-page PDF text, image EXIF summary, or screenshot detection. Never returns full file contents, and redacts card numbers, tax/SSN numbers, and passport numbers.',
    inputSchema: { path: z.string() },
  },
  async ({ path: filePath }) => {
    const hint = await classify(filePath);
    return { content: [{ type: 'text', text: JSON.stringify(hint, null, 2) }] };
  },
);

server.registerTool(
  'read_rules',
  { description: 'Reads and validates the current ORGANISE.md rules file.', inputSchema: {} },
  async () => {
    try {
      const rules = await readRules(rulesStore);
      return { content: [{ type: 'text', text: JSON.stringify(rules, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `No valid rules file yet at ${rulesStore.rulesPath}: ${(err as Error).message}` }] };
    }
  },
);

server.registerTool(
  'write_rules',
  {
    description:
      'Validates and writes a new ORGANISE.md, either from a full rules object or from a raw Markdown document (front matter + notes). The previous version is archived, never overwritten in place.',
    inputSchema: {
      markdown: z.string().optional().describe('A full ORGANISE.md document (YAML front matter + optional notes section).'),
      rules: z.custom<OrganiseRules>().optional().describe('A rules object to serialise, as an alternative to `markdown`.'),
    },
  },
  async ({ markdown, rules }) => {
    const next = markdown ? parseRules(markdown) : rules;
    if (!next) {
      return { content: [{ type: 'text', text: 'Provide either `markdown` or `rules`.' }], isError: true };
    }
    const result = await writeRules(rulesStore, next);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ written: rulesStore.rulesPath, previousVersionArchivedAt: result.versionArchived }, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  'propose_plan',
  {
    description:
      'Turns the current rules and a scan (or an explicit file list) into a reviewable plan of moves. Read-only — nothing is written to disk. The returned planId is required by apply.',
    inputSchema: {
      scopeOverride: z.array(z.string()).optional(),
    },
  },
  async ({ scopeOverride }) => {
    const rules = await readRules(rulesStore);
    const scope = scopeOverride ?? rules.scope;
    const isNeverTouch = buildNeverTouchMatcher(rules.never_touch);
    const scanResult = await scan({ scope, isNeverTouch, examplesPerGroup: Number.MAX_SAFE_INTEGER });
    const files = scanResult.groups.flatMap((g) => g.examples);
    lastScanFiles = files;

    const plan = await proposePlan({ rules, files });
    sessionPlans.set(plan.planId, plan);

    const grouped = new Map<string, { count: number; examples: string[] }>();
    for (const move of plan.moves) {
      const key = move.destination.split('/').slice(0, -1).join('/');
      const bucket = grouped.get(key) ?? { count: 0, examples: [] };
      bucket.count += 1;
      if (bucket.examples.length < 3) {
        bucket.examples.push(move.source.split('/').pop() ?? move.source);
      }
      grouped.set(key, bucket);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              planId: plan.planId,
              rulesVersion: plan.rulesVersion,
              totalMoves: plan.moves.length,
              groupedPreview: Array.from(grouped.entries()).map(([destination, g]) => ({ destination, ...g })),
              unmatchedCount: plan.unmatched.length,
              unmatchedSample: plan.unmatched.slice(0, 10),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  'apply',
  {
    description:
      'Executes a plan returned by propose_plan in this session. Refuses plans it did not produce. Journals every move before performing it, never overwrites an existing file, and requires confirmLargeBatch for plans over 500 moves.',
    inputSchema: {
      planId: z.string(),
      confirmLargeBatch: z.boolean().optional(),
    },
  },
  async ({ planId, confirmLargeBatch }) => {
    const plan = sessionPlans.get(planId);
    if (!plan) {
      const err = new StalePlanError(planId);
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
    try {
      const result = await applyPlan({ plan, journalStore, confirmLargeBatch });
      sessionPlans.delete(planId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      if (err instanceof LargeBatchError) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
      throw err;
    }
  },
);

server.registerTool(
  'undo',
  {
    description: 'Reverts a batch (or specific source paths within it) from the journal. Never overwrites; conflicts are reported, not forced.',
    inputSchema: {
      batchId: z.string(),
      sources: z.array(z.string()).optional(),
    },
  },
  async ({ batchId, sources }) => {
    const result = await undo({ journalStore, batchId, sources });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'quarantine',
  {
    description: 'Moves the given files into a dated quarantine folder with a hold period. Never deletes anything — the user empties quarantine themselves.',
    inputSchema: { paths: z.array(z.string()) },
  },
  async ({ paths }) => {
    const rules = await readRules(rulesStore);
    const result = await quarantine(paths, rules.quarantine, journalStore);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  'find_duplicates',
  {
    description: 'Hashes files from the most recent scan to flag exact duplicates. Read-only.',
    inputSchema: {},
  },
  async () => {
    const groups = await findDuplicates(lastScanFiles);
    return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] };
  },
);

server.registerTool(
  'status',
  {
    description: 'Reports the current rules version, last run time, lifetime move counts, and (if a scan has run this session) the unorganised file count.',
    inputSchema: {},
  },
  async () => {
    const journalEntries = await readJournal(journalStore);
    const report = await buildStatus({
      rulesStore,
      journalEntries,
      unorganisedFileCount: lastScanFiles.length || undefined,
    });
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
