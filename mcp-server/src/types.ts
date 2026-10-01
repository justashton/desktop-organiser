/** Shared types for the Desktop Organiser engine. */

export interface ProjectRule {
  name: string;
  aliases: string[];
  root: string;
  keywords: string[];
}

export interface RuleMatch {
  extension?: string[];
  name_pattern?: string;
  content_hint?: string;
  source_folder?: string;
  keyword_in?: string;
}

export interface Rule {
  match: RuleMatch;
  destination: string;
  rename?: string;
}

export interface NamingConfig {
  date_format: string;
  collision: 'suffix';
}

export interface QuarantineConfig {
  path: string;
  hold_days: number;
}

export interface OrganiseRules {
  version: number;
  scope: string[];
  projects: ProjectRule[];
  rules: Rule[];
  naming: NamingConfig;
  never_touch: string[];
  quarantine: QuarantineConfig;
  notes?: string;
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  sourceFolder: string;
  /** Short, privacy-minimising signature used to dedupe/group without hashing full contents. */
  signature: string;
}

export interface ScanResult {
  scope: string[];
  totalFiles: number;
  truncated: boolean;
  groups: ScanGroup[];
}

export interface ScanGroup {
  key: string;
  extension: string;
  count: number;
  totalSizeBytes: number;
  examples: FileEntry[];
}

export interface ClassificationHint {
  path: string;
  kind: 'csv' | 'pdf-text' | 'image' | 'screenshot' | 'unknown';
  /** Minimal excerpt only — never the full file contents. */
  excerpt?: string;
  csvHeaders?: string[];
  redacted: boolean;
}

export type MoveReason =
  | { type: 'rule'; ruleIndex: number }
  | { type: 'classification'; hint: ClassificationHint };

export interface ProposedMove {
  source: string;
  destination: string;
  reason: MoveReason;
}

export interface Plan {
  planId: string;
  createdAt: string;
  rulesVersion: number;
  moves: ProposedMove[];
  unmatched: string[];
  skipped: { path: string; reason: string }[];
}

export interface JournalEntry {
  batchId: string;
  timestamp: string;
  source: string;
  destination: string;
  sizeBytes: number;
  signature: string;
  undone: boolean;
}

export interface ApplyResult {
  batchId: string;
  applied: { source: string; destination: string }[];
  failed: { source: string; destination: string; error: string }[];
}

export interface UndoResult {
  batchId: string;
  reverted: { source: string; destination: string }[];
  conflicts: { source: string; destination: string; reason: string }[];
}

export interface StatusReport {
  rulesVersion: number | null;
  rulesPath: string;
  lastRunAt: string | null;
  totalBatches: number;
  totalMovesAppliedAllTime: number;
  totalMovesUndoneAllTime: number;
  unorganisedFileCount: number | null;
}
