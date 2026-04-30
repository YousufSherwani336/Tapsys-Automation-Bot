import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dirent } from 'node:fs';

/**
 * Returns sub-folder names under `<orgRootDir>/modules/`.
 * Skips dotfiles and non-directories.
 * Returns [] if the modules/ directory does not exist — that is a valid state.
 */
export async function discoverModules(orgRootDir: string): Promise<string[]> {
  const modulesDir = join(orgRootDir, 'modules');

  let entries: Dirent[];
  try {
    entries = await readdir(modulesDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  return entries
    .filter((e) => !e.name.startsWith('.') && e.isDirectory())
    .map((e) => e.name);
}
