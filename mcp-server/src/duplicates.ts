import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { FileEntry } from './types.js';

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export interface DuplicateGroup {
  hash: string;
  sizeBytes: number;
  paths: string[];
}

/**
 * Flags exact duplicates by content hash. Only compares files of equal size
 * first, so most files never need a hash computed at all.
 */
export async function findDuplicates(files: FileEntry[]): Promise<DuplicateGroup[]> {
  const bySize = new Map<number, FileEntry[]>();
  for (const file of files) {
    const bucket = bySize.get(file.sizeBytes) ?? [];
    bucket.push(file);
    bySize.set(file.sizeBytes, bucket);
  }

  const groups: DuplicateGroup[] = [];
  for (const [sizeBytes, candidates] of bySize) {
    if (candidates.length < 2) {
      continue;
    }
    const byHash = new Map<string, string[]>();
    for (const file of candidates) {
      const hash = await hashFile(file.path);
      const bucket = byHash.get(hash) ?? [];
      bucket.push(file.path);
      byHash.set(hash, bucket);
    }
    for (const [hash, paths] of byHash) {
      if (paths.length > 1) {
        groups.push({ hash, sizeBytes, paths });
      }
    }
  }

  return groups;
}
