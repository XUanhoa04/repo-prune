import { readFile } from 'node:fs/promises';
import type { RepoPruneConfig } from './config.js';
import type { RepositoryFile } from './filesystem.js';
import type { Finding } from '../models/finding.js';
import type { ReferenceIndex } from './reference-index.js';

export interface SourceFile extends RepositoryFile {
  content: string;
}

export interface RepositoryContext {
  root: string;
  config: RepoPruneConfig;
  files: RepositoryFile[];
  sourceFiles: SourceFile[];
  referenceIndex: ReferenceIndex;
}

export interface Analyzer {
  name: string;
  analyze(context: RepositoryContext): Promise<Finding[]>;
}

export async function loadSourceFiles(files: RepositoryFile[]): Promise<SourceFile[]> {
  return Promise.all(
    files.map(async (file) => ({ ...file, content: await readFile(file.absolutePath, 'utf8') })),
  );
}
