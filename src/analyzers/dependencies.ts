import path from 'node:path';
import type { Analyzer } from '../core/repository.js';
import { readPackageManifests } from '../core/package-json.js';
import {
  extractJavaScriptReferences,
  isJavaScriptFile,
  packageNameFromSpecifier,
} from '../languages/javascript.js';
import type { Finding } from '../models/finding.js';

const EXECUTABLE_ALIASES: Record<string, string[]> = {
  typescript: ['tsc'],
  '@typescript-eslint/parser': ['eslint'],
  '@typescript-eslint/eslint-plugin': ['eslint'],
  'typescript-eslint': ['eslint'],
  '@vitest/coverage-v8': ['vitest'],
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
    return findings;
  },
};
