import path from 'node:path';
import { readPackageManifests, type PackageManifest } from './package-json.js';
import { readPythonDependencies } from './python-project.js';
import type { SourceFile } from './repository.js';
import {
  analyzeJavaScriptFile,
  isJavaScriptFile,
  packageNameFromSpecifier,
  resolveJavaScriptImport,
  type JavaScriptAnalysis,
} from '../languages/javascript.js';
import {
  analyzePythonFile,
  buildPythonModuleIndex,
  resolvePythonImport,
  type PythonAnalysis,
} from '../languages/python.js';
import { expectedPythonImports } from '../languages/python-packages.js';

export interface CodeLocation {
  path: string;
  line: number;
}

export interface RepositorySignal extends CodeLocation {
  type: 'dynamic-import' | 'glob-loader';
  detail: string;
}

export interface DependencyDeclaration {
  ecosystem: 'node' | 'python';
  name: string;
  path: string;
}

export interface RepositoryInventory {
  dependencies: number;
  scripts: number;
  dockerStages: number;
  frameworks: string[];
}

export interface ReferenceIndex {
  incomingImports: Map<string, Set<string>>;
  outgoingImports: Map<string, Set<string>>;
  packageImporters: Map<string, Set<string>>;
  pythonModuleImporters: Map<string, Set<string>>;
  environmentReferences: Map<string, CodeLocation[]>;
  packageManifests: PackageManifest[];
  dependencyDeclarations: DependencyDeclaration[];
  dependencyImporters: Map<string, Set<string>>;
  javascriptAnalyses: Map<string, JavaScriptAnalysis>;
  pythonAnalyses: Map<string, PythonAnalysis>;
  signals: {
    dynamicImports: RepositorySignal[];
    globLoaders: RepositorySignal[];
    frameworks: string[];
  };
  inventory: RepositoryInventory;
}

const FRAMEWORK_PACKAGES: Readonly<Record<string, string>> = {
  next: 'Next.js',
  '@nestjs/core': 'NestJS',
  nuxt: 'Nuxt',
  '@remix-run/react': 'Remix',
  '@sveltejs/kit': 'SvelteKit',
};

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function addEnvironmentReference(
  map: Map<string, CodeLocation[]>,
  key: string,
  location: CodeLocation,
): void {
  const locations = map.get(key) ?? [];
  if (
    !locations.some(
      (candidate) => candidate.path === location.path && candidate.line === location.line,
    )
  ) {
    locations.push(location);
    map.set(key, locations);
  }
}

export function dependencyDeclarationKey(declaration: DependencyDeclaration): string {
  return `${declaration.ecosystem}:${declaration.path}:${declaration.name}`;
}

export function buildReferenceIndex(sourceFiles: SourceFile[]): ReferenceIndex {
  const knownPaths = new Set(sourceFiles.map((file) => file.relativePath));
  const incomingImports = new Map<string, Set<string>>(
    sourceFiles.map((file) => [file.relativePath, new Set<string>()]),
  );
  const outgoingImports = new Map<string, Set<string>>();
  const packageImporters = new Map<string, Set<string>>();
  const pythonModuleImporters = new Map<string, Set<string>>();
  const environmentReferences = new Map<string, CodeLocation[]>();
  const javascriptAnalyses = new Map<string, JavaScriptAnalysis>();
  const pythonAnalyses = new Map<string, PythonAnalysis>();
  const dynamicImports: RepositorySignal[] = [];
  const globLoaders: RepositorySignal[] = [];

  for (const file of sourceFiles.filter(isJavaScriptFile)) {
    const analysis = analyzeJavaScriptFile(file);
    javascriptAnalyses.set(file.relativePath, analysis);
    for (const specifier of analysis.specifiers) {
      const resolved = resolveJavaScriptImport(file, specifier, knownPaths);
      if (resolved) {
        addToSetMap(incomingImports, resolved, file.relativePath);
        addToSetMap(outgoingImports, file.relativePath, resolved);
      } else {
        const packageName = packageNameFromSpecifier(specifier);
        if (packageName) addToSetMap(packageImporters, packageName, file.relativePath);
      }
    }
    for (const reference of analysis.environmentReferences) {
      addEnvironmentReference(environmentReferences, reference.key, {
        path: file.relativePath,
        line: reference.line,
      });
    }
    dynamicImports.push(
      ...analysis.dynamicImports.map((signal) => ({
        type: 'dynamic-import' as const,
        path: file.relativePath,
        line: signal.line,
        detail: signal.detail,
      })),
    );
    globLoaders.push(
      ...analysis.globPatterns.map((signal) => ({
        type: 'glob-loader' as const,
        path: file.relativePath,
        line: signal.line,
        detail: signal.detail,
      })),
    );
  }

  const pythonFiles = sourceFiles.filter((file) => file.extension === '.py');
  const pythonModuleIndex = buildPythonModuleIndex(pythonFiles);
  for (const file of pythonFiles) {
    const analysis = analyzePythonFile(file);
    pythonAnalyses.set(file.relativePath, analysis);
    for (const reference of analysis.imports) {
      if (reference.module) addToSetMap(pythonModuleImporters, reference.module, file.relativePath);
      for (const name of reference.names) {
        if (reference.level === 0 && name !== '*') {
          const module = reference.module ? `${reference.module}.${name}` : name;
          addToSetMap(pythonModuleImporters, module, file.relativePath);
        }
      }
      for (const resolved of resolvePythonImport(file, reference, pythonModuleIndex)) {
        addToSetMap(incomingImports, resolved, file.relativePath);
        addToSetMap(outgoingImports, file.relativePath, resolved);
      }
    }
    for (const reference of analysis.environmentReferences) {
      addEnvironmentReference(environmentReferences, reference.key, {
        path: file.relativePath,
        line: reference.line,
      });
    }
    dynamicImports.push(
      ...analysis.dynamicImportLines.map((line) => ({
        type: 'dynamic-import' as const,
        path: file.relativePath,
        line,
        detail: 'Python runtime import',
      })),
    );
  }

  const packageManifests = readPackageManifests(sourceFiles);
  const dependencyDeclarations: DependencyDeclaration[] = [];
  for (const manifest of packageManifests) {
    const groups = [
      manifest.data.dependencies,
      manifest.data.devDependencies,
      manifest.data.optionalDependencies,
      manifest.data.peerDependencies,
    ];
    const dependencies = Object.assign({}, ...groups.filter(Boolean)) as Record<string, string>;
    for (const name of Object.keys(dependencies)) {
      dependencyDeclarations.push({ ecosystem: 'node', name, path: manifest.file.relativePath });
    }
  }
  for (const declaration of readPythonDependencies(sourceFiles)) {
    dependencyDeclarations.push({ ecosystem: 'python', ...declaration });
  }

  const dependencyImporters = new Map<string, Set<string>>();
  for (const declaration of dependencyDeclarations) {
    const importers = new Set<string>();
    if (declaration.ecosystem === 'node') {
      for (const importer of packageImporters.get(declaration.name) ?? []) importers.add(importer);
    } else {
      for (const expected of expectedPythonImports(declaration.name)) {
        for (const [module, moduleImporters] of pythonModuleImporters) {
          if (module === expected || module.startsWith(`${expected}.`)) {
            for (const importer of moduleImporters) importers.add(importer);
          }
        }
      }
    }
    dependencyImporters.set(dependencyDeclarationKey(declaration), importers);
  }

  const declaredNames = new Set(dependencyDeclarations.map((declaration) => declaration.name));
  const frameworks = Object.entries(FRAMEWORK_PACKAGES)
    .filter(([dependency]) => declaredNames.has(dependency))
    .map(([, framework]) => framework);
  const scripts = packageManifests.reduce(
    (count, manifest) => count + Object.keys(manifest.data.scripts ?? {}).length,
    0,
  );
  const dockerStages = sourceFiles.reduce((count, file) => {
    const basename = path.posix.basename(file.relativePath);
    if (basename !== 'Dockerfile' && !basename.endsWith('.Dockerfile')) return count;
    return (
      count + [...file.content.matchAll(/^\s*FROM\s+[^\s]+(?:\s+AS\s+[A-Za-z0-9_.-]+)?/gim)].length
    );
  }, 0);

  return {
    incomingImports,
    outgoingImports,
    packageImporters,
    pythonModuleImporters,
    environmentReferences,
    packageManifests,
    dependencyDeclarations,
    dependencyImporters,
    javascriptAnalyses,
    pythonAnalyses,
    signals: { dynamicImports, globLoaders, frameworks },
    inventory: { dependencies: dependencyDeclarations.length, scripts, dockerStages, frameworks },
  };
}
