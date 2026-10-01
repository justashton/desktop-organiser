import path from 'node:path';
import micromatch from 'micromatch';

/**
 * Defaults are additive to whatever a rules file lists under `never_touch` —
 * they can never be weakened by a rules file, only extended.
 */
export const DEFAULT_NEVER_TOUCH: string[] = [
  '**/.git/**',
  '**/.git',
  '**/node_modules/**',
  '**/*.app',
  '**/*.app/**',
  '**/.*', // hidden files/dirs (dotfiles), including cloud-sync markers
  '**/.*/**',
  '**/Library/**',
  '**/System/**',
  '**/AppData/**',
  '**/Program Files/**',
  '**/Program Files (x86)/**',
  '**/Windows/**',
];

/** Cloud-sync placeholder extensions that look present on disk but aren't downloaded locally. */
const CLOUD_PLACEHOLDER_EXTENSIONS = new Set([
  '.icloud', // iCloud Drive "evicted" placeholder
  '.onetemp', // OneDrive temp/placeholder artifact
]);

export function isCloudPlaceholder(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (CLOUD_PLACEHOLDER_EXTENSIONS.has(ext)) {
    return true;
  }
  // iCloud placeholders are named `.<realname>.icloud`; already caught by the
  // leading-dot default above, but checked explicitly for clarity/testing.
  return path.basename(filePath).startsWith('.') && filePath.endsWith('.icloud');
}

export function buildNeverTouchMatcher(extraPatterns: string[]): (filePath: string) => boolean {
  const patterns = [...DEFAULT_NEVER_TOUCH, ...extraPatterns];
  return (filePath: string) => {
    const normalised = filePath.split(path.sep).join('/');
    return micromatch.isMatch(normalised, patterns, { dot: true }) || isCloudPlaceholder(filePath);
  };
}
