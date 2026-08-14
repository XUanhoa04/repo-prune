import path from 'node:path';
import { createPathIgnore } from './ignore.js';
import { walkRepository } from './filesystem.js';
import { loadConfig, type RepoPruneConfig } from './config.js';
import { loadSourceFiles, type Analyzer } from './repository.js';
import type { FindingCategory, ScanResult } from '../models/finding.js';

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
  staleDays?: number;
}

export async function scanRepository(
  requestedRoot: string,
  analyzers: Analyzer[],
  options: ScanOptions = {},
): Promise<ScanResult> {
  const startedAt = performance.now();
  const root = path.resolve(requestedRoot);
  const loadedConfig = await loadConfig(root);
  const config: RepoPruneConfig =
    options.staleDays !== undefined
      ? {
          ...loadedConfig,
          thresholds: { ...loadedConfig.thresholds, stale_todo_days: options.staleDays },
        }
      : loadedConfig;
  const pathIgnore = await createPathIgnore(root, config.ignore.paths);
  const walked = await walkRepository(root, pathIgnore, config.thresholds.max_file_size_bytes);
  const sourceFiles = await loadSourceFiles(walked.files);
  const context = { root, config, files: walked.files, sourceFiles };
  const selected = options.categories
    ? analyzers.filter((analyzer) => options.categories?.includes(analyzerCategory(analyzer.name)))
    : analyzers;
  const findings = (await Promise.all(selected.map((analyzer) => analyzer.analyze(context))))
    .flat()
    .sort((left, right) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[left.confidence] - rank[right.confidence] || left.id.localeCompare(right.id);
    });
  const languageBytes: Record<string, number> = {};
  for (const file of walked.files) {
    const language = LANGUAGE_EXTENSIONS[file.extension] ?? 'Other';
    languageBytes[language] = (languageBytes[language] ?? 0) + file.size;
  }

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
      durationMs: Math.round(performance.now() - startedAt),
    },
  };
}

function analyzerCategory(name: string): FindingCategory {
  const category = name as FindingCategory;
  return category;
}
