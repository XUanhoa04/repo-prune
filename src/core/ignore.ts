import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { minimatch } from 'minimatch';

export const DEFAULT_IGNORE_DIRECTORIES = [
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.pytest_cache',
  '__pycache__',
  'vendor',
  'target',
];

export interface PathIgnore {
  ignores(relativePath: string, isDirectory?: boolean): boolean;
}

export async function createPathIgnore(root: string, configured: string[]): Promise<PathIgnore> {
  const matcher: Ignore = ignore();
  matcher.add(DEFAULT_IGNORE_DIRECTORIES.map((directory) => `${directory}/`));
  try {
    matcher.add(await readFile(path.join(root, '.gitignore'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return {
    ignores(relativePath, isDirectory = false) {
      const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
      const candidate = isDirectory && !normalized.endsWith('/') ? `${normalized}/` : normalized;
      if (matcher.ignores(candidate)) return true;
      return configured.some((pattern) =>
        minimatch(normalized, pattern, { dot: true, matchBase: false }),
      );
    },
  };
}
