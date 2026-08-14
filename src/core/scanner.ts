import path from 'node:path';
import { createPathIgnore } from './ignore.js';
import { walkRepository } from './filesystem.js';
import { loadConfig, type RepoPruneConfig } from './config.js';
import { loadSourceFiles, type Analyzer } from './repository.js';
import type { FindingCategory, ScanResult } from '../models/finding.js';
import { buildReferenceIndex } from './reference-index.js';
import { isConventionFile, matchesDynamicImportPath } from './conventions.js';
import { isJavaScriptFile } from '../languages/javascript.js';
import { buildGitScope } from './git.js';
import { applyGitScope, correlateFindings } from './correlation.js';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.py': 'Python',
};

export interface ScanOptions {
  categories?: FindingCategory[];
  since?: string;
}

export async function scanRepository(
  requestedRoot: string,
  analyzers: Analyzer[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const startedAt = performance.now();
  const root = path.resolve(requestedRoot);
  const config: RepoPruneConfig = await loadConfig(root);
  const pathIgnore = await createPathIgnore(root, config.ignore.paths);
  const walked = await walkRepository(root, pathIgnore, config.thresholds.max_file_size_bytes);
  const sourceFiles = await loadSourceFiles(walked.files);
  const referenceIndex = buildReferenceIndex(sourceFiles);
  const gitScope = options.since
    ? await buildGitScope(root, options.since, sourceFiles, config.thresholds.max_file_size_bytes)
    : undefined;
  const context = {
    root,
    config,
    files: walked.files,
    sourceFiles,
    referenceIndex,
    ...(gitScope ? { gitScope } : {}),
  };
  const selected = options.categories
    ? analyzers.filter((analyzer) => options.categories?.includes(analyzerCategory(analyzer.name)))
    : analyzers;
  const analyzerFindings = (
    await Promise.all(selected.map((analyzer) => analyzer.analyze(context)))
  ).flat();
  const enabledCategories = new Set(selected.map((analyzer) => analyzerCategory(analyzer.name)));
  const correlatedFindings = correlateFindings(analyzerFindings, context, enabledCategories);
  const scoped = applyGitScope(correlatedFindings, context);
  const findings = scoped.findings.sort((left, right) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return rank[left.confidence] - rank[right.confidence] || left.id.localeCompare(right.id);
  });
  const languageBytes: Record<string, number> = {};
  for (const file of walked.files) {
    const language = LANGUAGE_EXTENSIONS[file.extension] ?? 'Other';
    languageBytes[language] = (languageBytes[language] ?? 0) + file.size;
  }
  const unreferencedSources = sourceFiles.filter(
    (file) =>
      (isJavaScriptFile(file) || file.extension === '.py') &&
      (referenceIndex.incomingImports.get(file.relativePath)?.size ?? 0) === 0,
  );

  return {
    version: '0.1.0',
    root,
    findings,
    summary: {
      totalFiles: walked.files.length + walked.skippedFiles,
      scannedFiles: walked.files.length,
      skippedFiles: walked.skippedFiles,
      estimatedSavingsBytes: findings.reduce(
        (total, finding) => total + Number(finding.metadata?.sizeBytes ?? 0),
        0,
      ),
      languageBytes,
      inventory: referenceIndex.inventory,
      suppressed: {
        safetyConventions: unreferencedSources.filter(isConventionFile).length,
        dynamicPaths: unreferencedSources.filter((file) =>
          matchesDynamicImportPath(file, config.dynamic_import_paths),
        ).length,
        sinceFilter: scoped.hidden,
      },
      durationMs: Math.round(performance.now() - startedAt),
    },
    ...(gitScope
      ? {
          scope: {
            since: gitScope.requestedBase,
            mergeBase: gitScope.mergeBase,
            changedFiles: gitScope.changes.length,
          },
        }
      : {}),
  };
}

function analyzerCategory(name: string): FindingCategory {
  const category = name as FindingCategory;
  return category;
}
