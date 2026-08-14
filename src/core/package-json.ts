import type { SourceFile } from './repository.js';

export interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  bin?: string | Record<string, string>;
  exports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PackageManifest {
  file: SourceFile;
  data: PackageJson;
}

export function readPackageManifests(files: SourceFile[]): PackageManifest[] {
  const manifests: PackageManifest[] = [];
  for (const file of files) {
    if (!file.relativePath.endsWith('package.json')) continue;
    try {
      manifests.push({ file, data: JSON.parse(file.content) as PackageJson });
    } catch {
      // Invalid package.json is outside repo-prune's diagnostic scope.
    }
  }
  return manifests;
}

export function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStringValues);
  }
  return [];
}
