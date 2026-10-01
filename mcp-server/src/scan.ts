import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fg from 'fast-glob';
import type { FileEntry, ScanGroup, ScanResult } from './types.js';

export interface ScanOptions {
  scope: string[];
  /** Predicate from `buildNeverTouchMatcher`; files it matches are excluded before anything else. */
  isNeverTouch: (filePath: string) => boolean;
  /** Caps the number of example files kept per group, to bound token usage on huge folders. */
  examplesPerGroup?: number;
  /** Caps the total number of files scanned, to bound latency on huge folders. */
  maxFiles?: number;
}

function expandHome(p: string): string {
  if (p === '~') {
    return os.homedir();
  }
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** A short, cheap signature (not a full content hash) used for lightweight grouping. */
function lightSignature(entry: { sizeBytes: number; modifiedAt: string; name: string }): string {
  return createHash('sha1').update(`${entry.name}:${entry.sizeBytes}:${entry.modifiedAt}`).digest('hex').slice(0, 12);
}

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const examplesPerGroup = options.examplesPerGroup ?? 5;
  const maxFiles = options.maxFiles ?? 20_000;

  const expandedScope = options.scope.map(expandHome);
  const entries: FileEntry[] = [];

  for (const dir of expandedScope) {
    const candidates = await fg('**/*', {
      cwd: dir,
      dot: true,
      onlyFiles: true,
      absolute: true,
      suppressErrors: true,
    });

    for (const filePath of candidates) {
      if (entries.length >= maxFiles) {
        break;
      }
      if (options.isNeverTouch(filePath)) {
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        continue; // vanished between glob and stat, or unreadable — skip, never error the whole scan
      }

      const name = path.basename(filePath);
      const extension = path.extname(filePath).toLowerCase();
      const modifiedAt = fileStat.mtime.toISOString();
      entries.push({
        path: filePath,
        name,
        extension,
        sizeBytes: fileStat.size,
        modifiedAt,
        sourceFolder: path.dirname(filePath),
        signature: lightSignature({ name, sizeBytes: fileStat.size, modifiedAt }),
      });
    }
  }

  const truncated = entries.length >= maxFiles;

  const groupsByKey = new Map<string, ScanGroup>();
  for (const entry of entries) {
    const key = entry.extension || '(no extension)';
    let group = groupsByKey.get(key);
    if (!group) {
      group = { key, extension: entry.extension, count: 0, totalSizeBytes: 0, examples: [] };
      groupsByKey.set(key, group);
    }
    group.count += 1;
    group.totalSizeBytes += entry.sizeBytes;
    if (group.examples.length < examplesPerGroup) {
      group.examples.push(entry);
    }
  }

  const groups = Array.from(groupsByKey.values()).sort((a, b) => b.count - a.count);

  return {
    scope: expandedScope,
    totalFiles: entries.length,
    truncated,
    groups,
  };
}
