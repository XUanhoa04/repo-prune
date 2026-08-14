import path from 'node:path';
import type { Analyzer } from '../core/repository.js';
import { dependencyDeclarationKey } from '../core/reference-index.js';
import { expectedPythonImports } from '../languages/python-packages.js';
export { PYTHON_PACKAGE_IMPORT_MAP } from '../languages/python-packages.js';
import type { Finding } from '../models/finding.js';
import { assessConfidence } from '../core/confidence.js';

const EXECUTABLE_ALIASES: Record<string, string[]> = {
  typescript: ['tsc'],
  '@typescript-eslint/parser': ['eslint'],
  '@typescript-eslint/eslint-plugin': ['eslint'],
  'typescript-eslint': ['eslint'],
  '@vitest/coverage-v8': ['vitest'],
};

const PYTHON_CLI_PACKAGES = new Set([
  'black',
  'flake8',
  'gunicorn',
  'mypy',
  'pip-tools',
  'pytest',
  'ruff',
  'tox',
  'uvicorn',
]);

function executableNames(dependency: string): string[] {
  const packageBasename = dependency.split('/').at(-1) ?? dependency;
  return [...new Set([packageBasename, ...(EXECUTABLE_ALIASES[dependency] ?? [])])];
}

function commandReferencesDependency(command: string, dependency: string): boolean {
  return executableNames(dependency).some((executable) => {
    const escaped = executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[\\s;&|])${escaped}(?:$|[\\s;&|:])`).test(command);
  });
}

export const dependenciesAnalyzer: Analyzer = {
  name: 'dependencies',
  async analyze(context): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const declaration of context.referenceIndex.dependencyDeclarations) {
      if (context.config.ignore.dependencies.includes(declaration.name)) continue;
      if (declaration.ecosystem === 'node' && declaration.name.startsWith('@types/')) continue;
      if (declaration.ecosystem === 'python' && PYTHON_CLI_PACKAGES.has(declaration.name)) continue;
      const importers = context.referenceIndex.dependencyImporters.get(
        dependencyDeclarationKey(declaration),
      );
      if (importers && importers.size > 0) continue;

      if (declaration.ecosystem === 'node') {
        const manifest = context.referenceIndex.packageManifests.find(
          (candidate) => candidate.file.relativePath === declaration.path,
        );
        const scripts = Object.values(manifest?.data.scripts ?? {});
        if (scripts.some((script) => commandReferencesDependency(script, declaration.name)))
          continue;
        const manifestDirectory = path.posix.dirname(declaration.path);
        const referencedByConfig = context.sourceFiles.some((file) => {
          if (file.relativePath === declaration.path) return false;
          if (manifestDirectory !== '.' && !file.relativePath.startsWith(`${manifestDirectory}/`)) {
            return false;
          }
          return (
            ['.json', '.yaml', '.yml', '.toml', '.js', '.cjs', '.mjs', '.ts'].includes(
              file.extension,
            ) && file.content.includes(declaration.name)
          );
        });
        if (referencedByConfig) continue;
      }

      const expectedImports =
        declaration.ecosystem === 'python' ? expectedPythonImports(declaration.name) : undefined;
      const supporting = [
        {
          type: 'declaration',
          message: `${declaration.name} is declared in ${declaration.path}`,
        },
        {
          type: 'imports',
          message: expectedImports
            ? `zero supported imports detected (${expectedImports.join(', ')})`
            : 'zero static imports or requires detected',
        },
        ...(declaration.ecosystem === 'node'
          ? [
              { type: 'scripts', message: 'package scripts do not reference it' },
              { type: 'config', message: 'nearby configuration does not reference it' },
            ]
          : [{ type: 'mapping', message: 'distribution-to-import mapping was checked' }]),
      ];
      const pluginLike = /(?:^|[-/])(plugin|preset|loader|adapter)(?:$|-)/.test(declaration.name);
      const contradicting = pluginLike
        ? [
            {
              type: 'plugin-package',
              message: `${declaration.name} looks like a package that may be discovered by a framework`,
            },
          ]
        : [];
      const uncertain = [
        ...context.referenceIndex.signals.dynamicImports.slice(0, 1).map((signal) => ({
          type: 'dynamic-import',
          message: `repository uses ${signal.detail}`,
          path: signal.path,
          line: signal.line,
        })),
        ...context.referenceIndex.signals.globLoaders.slice(0, 1).map((signal) => ({
          type: 'glob-loader',
          message: `repository uses ${signal.detail}`,
          path: signal.path,
          line: signal.line,
        })),
      ];
      const assessment = assessConfidence(supporting, contradicting, uncertain);
      findings.push({
        id: `dependencies:${declaration.path}:${declaration.name}`,
        category: 'dependencies',
        title:
          declaration.ecosystem === 'python'
            ? 'Potentially unused Python dependency'
            : 'Potentially unused dependency',
        path: declaration.path,
        confidence: assessment.level,
        supporting,
        contradicting,
        uncertain,
        recommendation:
          contradicting.length > 0 || uncertain.length > 0
            ? `Review the detected plugin/runtime loading signals before uninstalling ${declaration.name}.`
            : `Run a clean build and test suite before uninstalling ${declaration.name}.`,
        metadata: {
          dependency: declaration.name,
          declaredIn: declaration.path,
          ecosystem: declaration.ecosystem,
          ...(expectedImports ? { expectedImports } : {}),
          importers: [],
          references: 0,
        },
      });
    }
    return findings;
  },
};
