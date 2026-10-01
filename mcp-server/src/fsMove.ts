import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Appends `-2`, `-3`, ... before the extension until the path doesn't collide with an existing file. */
export async function uniqueDestination(destination: string): Promise<string> {
  if (!(await pathExists(destination))) {
    return destination;
  }
  const dir = path.dirname(destination);
  const ext = path.extname(destination);
  const base = path.basename(destination, ext);
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(dir, `${base}-${n}${ext}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
    n += 1;
  }
}

/** Moves a file, falling back to copy+unlink across devices (EXDEV). Never overwrites an existing destination. */
export async function moveFile(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await rename(source, destination);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(source, destination);
      await unlink(source);
      return;
    }
    throw err;
  }
}
