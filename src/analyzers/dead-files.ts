import path from 'node:path';
import type { Analyzer, RepositoryContext, SourceFile } from '../core/repository.js';
import {
  detectEntrypoints,
  isConventionFile,
  matchesDynamicImportPath,
} from '../core/conventions.js';
import {
  extractJavaScriptReferences,
  isJavaScriptFile,
  resolveJavaScriptImport,
} from '../languages/javascript.js';
import type { Finding } from '../models/finding.js';
import {
  buildPythonModuleIndex,
  extractPythonReferences,
  resolvePythonImport,
} from '../languages/python.js';

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

export const deadFilesAnalyzer: Analyzer = {
  name: 'files',
  async analyze(context): Promise<Finding[]> {
    const candidates = context.sourceFiles.filter(
      (file) => isJavaScriptFile(file) || file.extension === '.py',
    );
    const javascriptFiles = candidates.filter(isJavaScriptFile);
    const pythonFiles = candidates.filter((file) => file.extension === '.py');
    const knownPaths = new Set(context.sourceFiles.map((file) => file.relativePath));
    const incoming = new Map(candidates.map((file) => [file.relativePath, 0]));
    let javascriptHasNonLiteralImports = false;
    let pythonHasDynamicImports = false;

    for (const file of javascriptFiles) {
      const references = extractJavaScriptReferences(file);
      javascriptHasNonLiteralImports ||= references.hasNonLiteralDynamicImport;
      for (const specifier of references.specifiers) {
        const resolved = resolveJavaScriptImport(file, specifier, knownPaths);
        if (resolved && incoming.has(resolved))
          incoming.set(resolved, (incoming.get(resolved) ?? 0) + 1);
      }
    }
    const pythonModuleIndex = buildPythonModuleIndex(pythonFiles);
    for (const file of pythonFiles) {
      const references = extractPythonReferences(file);
      pythonHasDynamicImports ||= references.hasDynamicImports;
      for (const reference of references.imports) {
        for (const resolved of resolvePythonImport(file, reference, pythonModuleIndex)) {
          if (incoming.has(resolved)) incoming.set(resolved, (incoming.get(resolved) ?? 0) + 1);
        }
      }
    }

    const entrypoints = detectEntrypoints(context);
    const findings: Finding[] = [];
    for (const file of candidates) {
      if ((incoming.get(file.relativePath) ?? 0) > 0) continue;
      if (entrypoints.has(file.relativePath) || isConventionFile(file)) continue;
      if (matchesDynamicImportPath(file, context.config.dynamic_import_paths)) continue;
      if (hasTextReference(file, context)) continue;

      const hasDynamicImports =
        file.extension === '.py' ? pythonHasDynamicImports : javascriptHasNonLiteralImports;
      const confidence = hasDynamicImports ? 'medium' : 'high';
      findings.push({
        id: `files:${file.relativePath}`,
        category: 'files',
        title: 'Potential dead file',
        path: file.relativePath,
        confidence,
        evidence: [
          { type: 'import-graph', message: 'no incoming static imports' },
          { type: 'entrypoint', message: 'not a package or configured entrypoint' },
          { type: 'tests', message: 'not referenced by tests or documentation' },
          { type: 'config', message: 'not referenced by known configuration files' },
          { type: 'framework', message: 'not matched by supported framework conventions' },
        ],
        whyThisMayBeWrong:
          'Runtime dynamic imports, reflection, and framework-specific discovery cannot always be detected.',
        recommendation: 'Review the file and its runtime loading paths before removing it.',
        metadata: { sizeBytes: file.size, incomingImports: 0 },
      });
    }
    return findings;
  },
};
