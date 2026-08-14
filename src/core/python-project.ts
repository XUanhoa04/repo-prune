import path from 'node:path';
import { parse } from 'smol-toml';
import type { SourceFile } from './repository.js';

export interface PythonDependencyDeclaration {
  name: string;
  path: string;
}

function dependencyName(requirement: string): string | undefined {
  const withoutMarker = requirement.split(';')[0]?.trim() ?? '';
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[.*?\])?(?:\s*@|[<>=!~]|$)/.exec(
    withoutMarker,
  );
  return match?.[1]?.toLowerCase().replaceAll('_', '-');
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function readPythonDependencies(files: SourceFile[]): PythonDependencyDeclaration[] {
  const declarations: PythonDependencyDeclaration[] = [];
  for (const file of files) {
    if (/^requirements(?:-[^/]*)?\.txt$/.test(path.posix.basename(file.relativePath))) {
      for (const line of file.content.split(/\r?\n/)) {
        const cleaned = line.replace(/\s+#.*$/, '').trim();
        if (!cleaned || cleaned.startsWith('-')) continue;
        const name = dependencyName(cleaned);
        if (name) declarations.push({ name, path: file.relativePath });
      }
    }
    if (path.posix.basename(file.relativePath) !== 'pyproject.toml') continue;
    try {
      const document = parse(file.content) as Record<string, unknown>;
      const project = (document.project ?? {}) as Record<string, unknown>;
      const requirements = [
        ...stringArray(project.dependencies),
        ...Object.values(
          (project['optional-dependencies'] ?? {}) as Record<string, unknown>,
        ).flatMap(stringArray),
        ...Object.values((document['dependency-groups'] ?? {}) as Record<string, unknown>).flatMap(
          stringArray,
        ),
      ];
      for (const requirement of requirements) {
        const name = dependencyName(requirement);
        if (name) declarations.push({ name, path: file.relativePath });
      }
      const tool = (document.tool ?? {}) as Record<string, unknown>;
      const poetry = (tool.poetry ?? {}) as Record<string, unknown>;
      const poetryGroups = Object.values((poetry.group ?? {}) as Record<string, unknown>).flatMap(
        (group) => Object.keys(((group as Record<string, unknown>).dependencies ?? {}) as object),
      );
      const poetryNames = [
        ...Object.keys((poetry.dependencies ?? {}) as object),
        ...Object.keys((poetry['dev-dependencies'] ?? {}) as object),
        ...poetryGroups,
      ];
      for (const name of poetryNames) {
        if (name.toLowerCase() !== 'python') {
          declarations.push({
            name: name.toLowerCase().replaceAll('_', '-'),
            path: file.relativePath,
          });
        }
      }
    } catch {
      // Invalid TOML is handled by the project's own tooling.
    }
  }
  const unique = new Map(
    declarations.map((declaration) => [`${declaration.path}:${declaration.name}`, declaration]),
  );
  return [...unique.values()];
}

export function readPythonScriptModules(files: SourceFile[]): string[] {
  const modules: string[] = [];
  for (const file of files.filter(
    (candidate) => path.posix.basename(candidate.relativePath) === 'pyproject.toml',
  )) {
    try {
      const document = parse(file.content) as Record<string, unknown>;
      const project = (document.project ?? {}) as Record<string, unknown>;
      const tool = (document.tool ?? {}) as Record<string, unknown>;
      const poetry = (tool.poetry ?? {}) as Record<string, unknown>;
      const scripts = {
        ...((project.scripts ?? {}) as Record<string, unknown>),
        ...((poetry.scripts ?? {}) as Record<string, unknown>),
      };
      for (const value of Object.values(scripts)) {
        const target =
          typeof value === 'string'
            ? value
            : typeof value === 'object' && value
              ? (value as Record<string, unknown>).callable
              : undefined;
        if (typeof target === 'string') modules.push(target.split(':')[0] ?? target);
      }
    } catch {
      // Invalid TOML is outside entrypoint detection.
    }
  }
  return modules;
}
