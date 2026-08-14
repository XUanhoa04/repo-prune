import path from 'node:path';
import type { Analyzer, RepositoryContext, SourceFile } from '../core/repository.js';
import {
  detectEntrypoints,
  isConventionFile,
  matchesDynamicImportPath,
} from '../core/conventions.js';
import { isJavaScriptFile } from '../languages/javascript.js';
import type { Evidence, Finding } from '../models/finding.js';
import { assessConfidence } from '../core/confidence.js';

const REFERENCE_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.md', '.mdx']);

function hasTextReference(candidate: SourceFile, context: RepositoryContext): boolean {
  const basename = path.posix.basename(candidate.relativePath, candidate.extension);
  return context.sourceFiles.some(
    (file) =>
      file.relativePath !== candidate.relativePath &&
      (REFERENCE_EXTENSIONS.has(file.extension) || /(?:test|spec)/i.test(file.relativePath)) &&
      (file.content.includes(candidate.relativePath) || file.content.includes(basename)),
  );
}

function uncertaintyForFile(
  file: SourceFile,
  context: RepositoryContext,
): { uncertain: Evidence[]; contradicting: Evidence[] } {
  const languageSignals = context.referenceIndex.signals.dynamicImports.filter((signal) =>
    file.extension === '.py' ? signal.path.endsWith('.py') : !signal.path.endsWith('.py'),
  );
  const uncertain = [
    ...languageSignals.slice(0, 2).map((signal) => ({
      type: 'dynamic-import',
      message: `repository uses ${signal.detail}`,
      path: signal.path,
      line: signal.line,
    })),
    ...context.referenceIndex.signals.globLoaders.slice(0, 2).map((signal) => ({
      type: 'glob-loader',
      message: `glob-based module loading detected (${signal.detail})`,
      path: signal.path,
      line: signal.line,
    })),
  ];
  const contradicting: Evidence[] = [];
  if (
    context.referenceIndex.signals.frameworks.includes('NestJS') &&
    /@(Controller|Injectable|Module|Resolver|Processor)\b/.test(file.content)
  ) {
    contradicting.push({
      type: 'framework-decorator',
      message: 'NestJS is detected and this file contains a discovery-related decorator',
      path: file.relativePath,
    });
  }
  return { uncertain, contradicting };
}

export const deadFilesAnalyzer: Analyzer = {
  name: 'files',
  async analyze(context): Promise<Finding[]> {
    const candidates = context.sourceFiles.filter(
      (file) => isJavaScriptFile(file) || file.extension === '.py',
    );
    const entrypoints = detectEntrypoints(context);
    const findings: Finding[] = [];
    for (const file of candidates) {
      if ((context.referenceIndex.incomingImports.get(file.relativePath)?.size ?? 0) > 0) continue;
      if (entrypoints.has(file.relativePath) || isConventionFile(file)) continue;
      if (matchesDynamicImportPath(file, context.config.dynamic_import_paths)) continue;
      if (hasTextReference(file, context)) continue;

      const supporting = [
        { type: 'import-graph', message: 'no source file imports it' },
        { type: 'entrypoint', message: 'not a package or configured entrypoint' },
        { type: 'tests', message: 'tests and documentation do not reference it' },
        { type: 'config', message: 'known configuration files do not reference it' },
        { type: 'framework', message: 'no supported framework convention protects it' },
      ];
      const { uncertain, contradicting } = uncertaintyForFile(file, context);
      const assessment = assessConfidence(supporting, contradicting, uncertain);
      const firstCaveat = [...contradicting, ...uncertain][0];
      findings.push({
        id: `files:${file.relativePath}`,
        category: 'files',
        title: 'Potential dead file',
        path: file.relativePath,
        confidence: assessment.level,
        supporting,
        contradicting,
        uncertain,
        recommendation: firstCaveat?.path
          ? `Review ${firstCaveat.path}${firstCaveat.line ? `:${firstCaveat.line}` : ''}, then run git grep for the filename.`
          : 'Run git grep for the filename and review runtime loading paths before removing it.',
        metadata: {
          sizeBytes: file.size,
          incomingImports: 0,
          uncertaintySignals: uncertain.length + contradicting.length,
        },
      });
    }
    return findings;
  },
};
