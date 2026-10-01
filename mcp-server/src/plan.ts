import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { ClassificationHint, FileEntry, OrganiseRules, Plan, ProjectRule, ProposedMove, Rule } from './types.js';
import { classify } from './classify.js';

function expandHome(p: string): string {
  if (p === '~') {
    return os.homedir();
  }
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function hintText(hint: ClassificationHint | undefined): string {
  if (!hint) {
    return '';
  }
  return [hint.excerpt ?? '', (hint.csvHeaders ?? []).join(',')].join(' ').toLowerCase();
}

function findProject(projects: ProjectRule[], name: string): ProjectRule | undefined {
  return projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

function matchesKeyword(file: FileEntry, hint: ClassificationHint | undefined, project: ProjectRule): boolean {
  const haystack = `${file.name} ${hintText(hint)}`.toLowerCase();
  return [project.name, ...project.aliases, ...project.keywords].some((k) => haystack.includes(k.toLowerCase()));
}

function matchesRule(file: FileEntry, rule: Rule, hint: ClassificationHint | undefined, projects: ProjectRule[]): boolean {
  const { match } = rule;

  if (match.extension && !match.extension.map((e) => e.toLowerCase()).includes(file.extension.toLowerCase())) {
    return false;
  }
  if (match.name_pattern && !new RegExp(match.name_pattern).test(file.name)) {
    return false;
  }
  if (match.source_folder) {
    const expected = expandHome(match.source_folder);
    if (path.resolve(file.sourceFolder) !== path.resolve(expected)) {
      return false;
    }
  }
  if (match.content_hint) {
    if (!hintText(hint).includes(match.content_hint.toLowerCase())) {
      return false;
    }
  }
  if (match.keyword_in) {
    const project = findProject(projects, match.keyword_in);
    if (!project || !matchesKeyword(file, hint, project)) {
      return false;
    }
  }

  // A match{} block with no conditions would match everything; the schema in
  // rules.ts already rejects that at write time, so no `true` fallback here.
  return true;
}

function needsContentHint(rule: Rule): boolean {
  return Boolean(rule.match.content_hint || rule.match.keyword_in);
}

const CLASSIFIABLE_EXTENSIONS = new Set(['.csv', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic']);

function resolveDestination(template: string, file: FileEntry, projectName: string | undefined): string {
  const date = new Date(file.modifiedAt);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const resolved = template
    .replace('{year}', year)
    .replace('{month}', month)
    .replace('{project}', projectName ?? 'unsorted');
  return path.join(expandHome(resolved), file.name);
}

export interface ProposePlanOptions {
  rules: OrganiseRules;
  files: FileEntry[];
}

export async function proposePlan({ rules, files }: ProposePlanOptions): Promise<Plan> {
  const moves: ProposedMove[] = [];
  const unmatched: string[] = [];

  for (const file of files) {
    let hint: ClassificationHint | undefined;
    const needsHint = rules.rules.some(needsContentHint) && CLASSIFIABLE_EXTENSIONS.has(file.extension.toLowerCase());
    if (needsHint) {
      hint = await classify(file.path);
    }

    let matchedRuleIndex = -1;
    for (let i = 0; i < rules.rules.length; i += 1) {
      if (matchesRule(file, rules.rules[i], hint, rules.projects)) {
        matchedRuleIndex = i;
        break;
      }
    }

    if (matchedRuleIndex === -1) {
      unmatched.push(file.path);
      continue;
    }

    const rule = rules.rules[matchedRuleIndex];
    const projectName = rule.match.keyword_in;
    const destinationDir = resolveDestination(rule.destination, file, projectName);
    moves.push({
      source: file.path,
      destination: destinationDir,
      reason: { type: 'rule', ruleIndex: matchedRuleIndex },
    });
  }

  return {
    planId: randomUUID(),
    createdAt: new Date().toISOString(),
    rulesVersion: rules.version,
    moves,
    unmatched,
    skipped: [],
  };
}
