import path from 'node:path';
import type { Analyzer } from '../core/repository.js';
import { readPackageManifests } from '../core/package-json.js';
import {
  extractJavaScriptReferences,
  isJavaScriptFile,
  packageNameFromSpecifier,
} from '../languages/javascript.js';
import type { Finding } from '../models/finding.js';
import { readPythonDependencies } from '../core/python-project.js';
import { importedPythonModules } from '../languages/python.js';

const EXECUTABLE_ALIASES: Record<string, string[]> = {
  typescript: ['tsc'],
  '@typescript-eslint/parser': ['eslint'],
  '@typescript-eslint/eslint-plugin': ['eslint'],
  'typescript-eslint': ['eslint'],
  '@vitest/coverage-v8': ['vitest'],
};

export const PYTHON_PACKAGE_IMPORT_MAP: Readonly<Record<string, readonly string[]>> = {
  beautifulsoup4: ['bs4'],
  'google-cloud-storage': ['google.cloud.storage'],
  'opencv-python': ['cv2'],
  pillow: ['PIL'],
  'psycopg2-binary': ['psycopg2'],
  pyyaml: ['yaml'],
  'python-dateutil': ['dateutil'],
  'scikit-learn': ['sklearn'],
};

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
    const importedPackages = new Set<string>();
    for (const file of context.sourceFiles.filter(isJavaScriptFile)) {
      for (const specifier of extractJavaScriptReferences(file).specifiers) {
        const packageName = packageNameFromSpecifier(specifier);
        if (packageName) importedPackages.add(packageName);
      }
    }

    const findings: Finding[] = [];
    for (const manifest of readPackageManifests(context.sourceFiles)) {
      const groups = [
        manifest.data.dependencies,
        manifest.data.devDependencies,
        manifest.data.optionalDependencies,
        manifest.data.peerDependencies,
      ];
      const declared = Object.assign({}, ...groups.filter(Boolean)) as Record<string, string>;
      const scripts = Object.values(manifest.data.scripts ?? {});
      const manifestDirectory = path.posix.dirname(manifest.file.relativePath);
      const relevantConfig = context.sourceFiles.filter((file) => {
        if (file.relativePath === manifest.file.relativePath) return false;
        if (manifestDirectory !== '.' && !file.relativePath.startsWith(`${manifestDirectory}/`))
          return false;
        return ['.json', '.yaml', '.yml', '.toml', '.js', '.cjs', '.mjs', '.ts'].includes(
          file.extension,
        );
      });

      for (const dependency of Object.keys(declared).sort()) {
        if (context.config.ignore.dependencies.includes(dependency)) continue;
        // Declaration packages are consumed implicitly by TypeScript and often have no import.
        if (dependency.startsWith('@types/')) continue;
        if (importedPackages.has(dependency)) continue;
        if (scripts.some((script) => commandReferencesDependency(script, dependency))) continue;
        if (relevantConfig.some((file) => file.content.includes(dependency))) continue;

        findings.push({
          id: `dependencies:${manifest.file.relativePath}:${dependency}`,
          category: 'dependencies',
          title: 'Potentially unused dependency',
          path: manifest.file.relativePath,
          confidence: 'medium',
          evidence: [
            {
              type: 'declaration',
              message: `${dependency} is declared in ${manifest.file.relativePath}`,
            },
            { type: 'imports', message: 'zero static imports or requires detected' },
            { type: 'scripts', message: 'not referenced by package scripts' },
            { type: 'config', message: 'not referenced by nearby configuration' },
          ],
          whyThisMayBeWrong:
            'Dependencies can be loaded by plugins, command aliases, generated code, or at runtime.',
          recommendation: `Verify runtime and build-tool usage of ${dependency} before uninstalling it.`,
          metadata: { dependency, declaredIn: manifest.file.relativePath, references: 0 },
        });
      }
    }

    const pythonImports = importedPythonModules(context.sourceFiles);
    for (const declaration of readPythonDependencies(context.sourceFiles)) {
      if (context.config.ignore.dependencies.includes(declaration.name)) continue;
      const expectedImports = PYTHON_PACKAGE_IMPORT_MAP[declaration.name] ?? [
        declaration.name.replaceAll('-', '_'),
      ];
      const isImported = expectedImports.some((expected) =>
        [...pythonImports].some(
          (imported) => imported === expected || imported.startsWith(`${expected}.`),
        ),
      );
      if (isImported) continue;
      findings.push({
        id: `dependencies:${declaration.path}:${declaration.name}`,
        category: 'dependencies',
        title: 'Potentially unused Python dependency',
        path: declaration.path,
        confidence: 'medium',
        evidence: [
          {
            type: 'declaration',
            message: `${declaration.name} is declared in ${declaration.path}`,
          },
          {
            type: 'imports',
            message: `zero supported imports detected (${expectedImports.join(', ')})`,
          },
          { type: 'mapping', message: 'distribution-to-import name mapping was considered' },
        ],
        whyThisMayBeWrong:
          'Python packages can expose command-line tools, plugins, or import names not covered by the mapping.',
        recommendation: `Verify runtime, CLI, and plugin usage of ${declaration.name} before uninstalling it.`,
        metadata: {
          dependency: declaration.name,
          declaredIn: declaration.path,
          expectedImports,
          references: 0,
        },
      });
    }
    return findings;
  },
};
