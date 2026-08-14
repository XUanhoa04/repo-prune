import path from 'node:path';
import { minimatch } from 'minimatch';
import type { RepositoryContext, SourceFile } from './repository.js';
import { collectStringValues, readPackageManifests } from './package-json.js';

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
  'pages/**/*.{js,jsx,ts,tsx}',
  '**/middleware.{js,ts}',
  '**/next.config.*',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  'tests/**',
  'test/**',
  '**/fixtures/**',
  '**/generated/**',
];

function normalizeManifestTarget(manifestPath: string, target: string): string {
  const cleanTarget = target.replace(/^\.\//, '').split('#')[0] ?? target;
  return path.posix.normalize(path.posix.join(path.posix.dirname(manifestPath), cleanTarget));
}

export function detectEntrypoints(context: RepositoryContext): Set<string> {
  const entrypoints = new Set(
    context.config.entrypoints.map((value) => value.replaceAll('\\', '/')),
  );
  for (const manifest of readPackageManifests(context.sourceFiles)) {
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
  }
  return entrypoints;
}

export function isConventionFile(file: SourceFile): boolean {
  if (COMMON_ENTRYPOINT_BASENAMES.has(path.posix.basename(file.relativePath))) return true;
  return CONVENTION_PATTERNS.some((pattern) =>
    minimatch(file.relativePath, pattern, { dot: true }),
  );
}

export function matchesDynamicImportPath(file: SourceFile, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(file.relativePath, pattern, { dot: true }));
}
