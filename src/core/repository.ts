import { readFile } from 'node:fs/promises';
import type { RepoPruneConfig } from './config.js';
import type { RepositoryFile } from './filesystem.js';
import type { Finding } from '../models/finding.js';
import type { ReferenceIndex } from './reference-index.js';
import type { GitScope } from './git.js';

export interface SourceFile extends RepositoryFile {
  content: string;
}

export interface RepositoryContext {
  root: string;
  config: RepoPruneConfig;
  files: RepositoryFile[];
  sourceFiles: SourceFile[];
  referenceIndex: ReferenceIndex;
  gitScope?: GitScope;
}

export interface Analyzer {
  name: string;
  analyze(context: RepositoryContext): Promise<Finding[]>;
}

export async function loadSourceFiles(files: RepositoryFile[]): Promise<SourceFile[]> {
  const loaded: Array<SourceFile | undefined> = new Array(files.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < files.length) {
      const index = nextIndex++;
      const file = files[index];
      if (file) loaded[index] = { ...file, content: await readFile(file.absolutePath, 'utf8') };
    }
  };
  // Bound concurrency avoids opening thousands of files at once on large repositories.
  await Promise.all(Array.from({ length: Math.min(32, files.length) }, worker));
  return loaded.filter((file): file is SourceFile => Boolean(file));
}
