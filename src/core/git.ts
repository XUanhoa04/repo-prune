import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SourceFile } from './repository.js';
import {
  analyzeJavaScriptFile,
  isJavaScriptFile,
  packageNameFromSpecifier,
  resolveJavaScriptImport,
} from '../languages/javascript.js';
import {
  analyzePythonFile,
  buildPythonModuleIndex,
  resolvePythonImport,
} from '../languages/python.js';

const execFileAsync = promisify(execFile);

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitChange {
  status: GitChangeStatus;
  path: string;
  previousPath?: string;
}

export interface HistoricalUsage {
  fileImporters: Map<string, Set<string>>;
  packageImporters: Map<string, Set<string>>;
  environmentReferences: Map<string, Set<string>>;
  contents: Map<string, string>;
}

export interface GitScope {
  requestedBase: string;
  mergeBase: string;
  changes: GitChange[];
  historical: HistoricalUsage;
}

export class GitScopeError extends Error {
  override name = 'GitScopeError';
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim() || (error as Error).message;
    throw new GitScopeError(detail);
  }
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function scanRelativePath(repositoryPath: string, prefix: string): string | undefined {
  const normalized = normalize(repositoryPath);
  if (!prefix) return normalized;
  return normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length + 1) : undefined;
}

function parseChanges(output: string, prefix: string): GitChange[] {
  const tokens = output.split('\0').filter(Boolean);
  const changes: GitChange[] = [];
  for (let index = 0; index < tokens.length;) {
    const statusToken = tokens[index++];
    if (!statusToken) break;
    const code = statusToken[0];
    if (code === 'R' || code === 'C') {
      const previousRepositoryPath = tokens[index++];
      const currentRepositoryPath = tokens[index++];
      if (!previousRepositoryPath || !currentRepositoryPath) continue;
      const currentPath = scanRelativePath(currentRepositoryPath, prefix);
      const previousPath = scanRelativePath(previousRepositoryPath, prefix);
      if (currentPath) {
        changes.push({
          status: 'renamed',
          path: currentPath,
          ...(previousPath ? { previousPath } : {}),
        });
      }
      continue;
    }
    const repositoryPath = tokens[index++];
    if (!repositoryPath) continue;
    const relativePath = scanRelativePath(repositoryPath, prefix);
    if (!relativePath) continue;
    const status: GitChangeStatus = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
    changes.push({ status, path: relativePath });
  }
  return changes;
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function historicalUsage(previousFiles: SourceFile[], currentFiles: SourceFile[]): HistoricalUsage {
  const knownPaths = new Set(currentFiles.map((file) => file.relativePath));
  const fileImporters = new Map<string, Set<string>>();
  const packageImporters = new Map<string, Set<string>>();
  const environmentReferences = new Map<string, Set<string>>();
  const contents = new Map(previousFiles.map((file) => [file.relativePath, file.content]));
  const pythonIndex = buildPythonModuleIndex([
    ...currentFiles.filter((file) => file.extension === '.py'),
    ...previousFiles.filter((file) => file.extension === '.py'),
  ]);

  for (const file of previousFiles) {
    if (isJavaScriptFile(file)) {
      const analysis = analyzeJavaScriptFile(file);
      for (const specifier of analysis.specifiers) {
        const resolved = resolveJavaScriptImport(file, specifier, knownPaths);
        if (resolved) add(fileImporters, resolved, file.relativePath);
        else {
          const packageName = packageNameFromSpecifier(specifier);
          if (packageName) add(packageImporters, packageName, file.relativePath);
        }
      }
      for (const reference of analysis.environmentReferences) {
        add(environmentReferences, reference.key, file.relativePath);
      }
    } else if (file.extension === '.py') {
      const analysis = analyzePythonFile(file);
      for (const reference of analysis.imports) {
        for (const resolved of resolvePythonImport(file, reference, pythonIndex)) {
          if (knownPaths.has(resolved)) add(fileImporters, resolved, file.relativePath);
        }
        if (reference.level === 0 && reference.module) {
          add(
            packageImporters,
            reference.module.split('.')[0] ?? reference.module,
            file.relativePath,
          );
        }
      }
      for (const reference of analysis.environmentReferences) {
        add(environmentReferences, reference.key, file.relativePath);
      }
    }
  }
  return { fileImporters, packageImporters, environmentReferences, contents };
}

export async function buildGitScope(
  root: string,
  requestedBase: string,
  currentFiles: SourceFile[],
  maxFileSize: number,
): Promise<GitScope> {
  const gitRoot = path.resolve((await git(root, ['rev-parse', '--show-toplevel'])).trim());
  const relativeRoot = path.relative(gitRoot, root);
  if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
    throw new GitScopeError('scanned path is outside the Git worktree');
  }
  const prefix = normalize(relativeRoot);
  const mergeBase = (await git(root, ['merge-base', requestedBase, 'HEAD'])).trim();
  const output = await git(root, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    `${mergeBase}..HEAD`,
  ]);
  const changes = parseChanges(output, prefix);
  const previousFiles: SourceFile[] = [];
  for (const change of changes) {
    if (change.status === 'added') continue;
    const previousPath = change.previousPath ?? change.path;
    const repositoryPath = prefix ? `${prefix}/${previousPath}` : previousPath;
    try {
      const content = await git(root, ['show', `${mergeBase}:${repositoryPath}`]);
      const size = Buffer.byteLength(content);
      if (size > maxFileSize || content.includes('\0')) continue;
      previousFiles.push({
        absolutePath: path.join(root, previousPath),
        relativePath: previousPath,
        extension: path.posix.extname(previousPath).toLowerCase(),
        size,
        content,
      });
    } catch {
      // A rename crossing the scan root or a submodule may not have readable previous content.
    }
  }
  return {
    requestedBase,
    mergeBase,
    changes,
    historical: historicalUsage(previousFiles, currentFiles),
  };
}
