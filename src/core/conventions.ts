import path from 'node:path';
import { minimatch } from 'minimatch';
import type { RepositoryContext, SourceFile } from './repository.js';
import { collectStringValues } from './package-json.js';
import { readPythonScriptModules } from './python-project.js';
import { buildPythonModuleIndex } from '../languages/python.js';

const COMMON_ENTRYPOINT_BASENAMES = new Set([
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
  'index.ts',
  'index.tsx',
  'main.js',
  'main.ts',
  'server.js',
  'server.ts',
]);

const CONVENTION_PATTERNS = [
  'app/**/page.{js,jsx,ts,tsx}',
  'app/**/layout.{js,jsx,ts,tsx}',
  'app/**/route.{js,jsx,ts,tsx}',
  'app/**/loading.{js,jsx,ts,tsx}',
  'app/**/error.{js,jsx,ts,tsx}',
  'app/**/not-found.{js,jsx,ts,tsx}',
  'app/**/template.{js,jsx,ts,tsx}',
  'app/**/default.{js,jsx,ts,tsx}',
  'app/**/global-error.{js,jsx,ts,tsx}',
  'pages/**/*.{js,jsx,ts,tsx,vue,svelte,astro}',
  'routes/**/*.{js,jsx,ts,tsx,vue,svelte}',
  '**/middleware.{js,ts}',
  '**/*.config.{js,cjs,mjs,ts,mts,cts}',
  '**/*.setup.{js,cjs,mjs,ts,mts,cts}',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  'tests/**',
  'test/**',
  '**/fixtures/**',
  '**/generated/**',
  '**/migrations/**',
  '**/test_*.py',
];

const PYTHON_CONVENTION_BASENAMES = new Set([
  '__init__.py',
  '__main__.py',
  'main.py',
  'manage.py',
  'app.py',
  'conftest.py',
]);

function normalizeManifestTarget(manifestPath: string, target: string): string {
  const cleanTarget = target.replace(/^\.\//, '').split('#')[0] ?? target;
  return path.posix.normalize(path.posix.join(path.posix.dirname(manifestPath), cleanTarget));
}

export function detectEntrypoints(context: RepositoryContext): Set<string> {
  const entrypoints = new Set(
    context.config.entrypoints.map((value) => value.replaceAll('\\', '/')),
  );
  const knownPaths = new Set(context.sourceFiles.map((file) => file.relativePath));
  for (const manifest of context.referenceIndex.packageManifests) {
    const targets = [
      ...(manifest.data.main ? [manifest.data.main] : []),
      ...(manifest.data.module ? [manifest.data.module] : []),
      ...(typeof manifest.data.browser === 'string' ? [manifest.data.browser] : []),
      ...collectStringValues(manifest.data.bin),
      ...collectStringValues(manifest.data.exports),
    ];
    for (const target of targets) {
      if (target.startsWith('.')) {
        entrypoints.add(normalizeManifestTarget(manifest.file.relativePath, target));
      }
    }
    for (const command of Object.values(manifest.data.scripts ?? {})) {
      for (const match of command.matchAll(/(?:^|\s)(?:\.\/)?([\w./-]+\.(?:[cm]?[jt]sx?))\b/g)) {
        if (!match[1]) continue;
        const target = normalizeManifestTarget(manifest.file.relativePath, match[1]);
        if (knownPaths.has(target)) entrypoints.add(target);
      }
    }
  }
  const pythonModules = buildPythonModuleIndex(context.sourceFiles);
  for (const module of readPythonScriptModules(context.sourceFiles)) {
    const target = pythonModules.get(module) ?? pythonModules.get(`src.${module}`);
    if (target) entrypoints.add(target);
  }
  return entrypoints;
}

export function isConventionFile(file: SourceFile): boolean {
  if (COMMON_ENTRYPOINT_BASENAMES.has(path.posix.basename(file.relativePath))) return true;
  if (PYTHON_CONVENTION_BASENAMES.has(path.posix.basename(file.relativePath))) return true;
  return CONVENTION_PATTERNS.some((pattern) =>
    minimatch(file.relativePath, pattern, { dot: true }),
  );
}

export function matchesDynamicImportPath(file: SourceFile, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(file.relativePath, pattern, { dot: true }));
}
