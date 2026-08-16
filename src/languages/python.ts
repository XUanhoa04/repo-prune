import path from 'node:path';
import type { SourceFile } from '../core/repository.js';

export interface PythonImport {
  module: string;
  level: number;
  names: string[];
}

export interface PythonReferences {
  imports: PythonImport[];
  hasDynamicImports: boolean;
}

export interface PythonEnvironmentReference {
  key: string;
  line: number;
}

export interface PythonAnalysis extends PythonReferences {
  environmentReferences: PythonEnvironmentReference[];
  dynamicImportLines: number[];
}

function importedNames(value: string): string[] {
  return value
    .replace(/[()]/g, '')
    .split(',')
    .map((part) =>
      part
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim(),
    )
    .filter((name): name is string => Boolean(name));
}

export function analyzePythonFile(file: SourceFile): PythonAnalysis {
  const imports: PythonImport[] = [];
  const environmentReferences: PythonEnvironmentReference[] = [];
  const dynamicImportLines: number[] = [];
  const environmentPatterns = [
    /\b(?:os\.)?getenv\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
    /\b(?:os\.)?environ\s*\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g,
    /\b(?:os\.)?environ\.(?:get|setdefault)\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
  ];
  for (const [index, rawLine] of file.content.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, '');
    const importMatch = /^\s*import\s+(.+?)\s*$/.exec(line);
    if (importMatch?.[1]) {
      for (const module of importedNames(importMatch[1])) {
        imports.push({ module, level: 0, names: [] });
      }
    }
    const fromMatch = /^\s*from\s+(\.*)([A-Za-z_][\w.]*)?\s+import\s+(.+?)\s*$/.exec(line);
    if (fromMatch) {
      imports.push({
        module: fromMatch[2] ?? '',
        level: fromMatch[1]?.length ?? 0,
        names: importedNames(fromMatch[3] ?? ''),
      });
    }
    if (/\b(?:importlib\.import_module|__import__)\s*\(/.test(line)) {
      dynamicImportLines.push(index + 1);
    }
    for (const pattern of environmentPatterns) {
      for (const match of line.matchAll(pattern)) {
        if (match[1]) environmentReferences.push({ key: match[1], line: index + 1 });
      }
    }
  }
  return {
    imports,
    hasDynamicImports: dynamicImportLines.length > 0,
    environmentReferences,
    dynamicImportLines,
  };
}

export function extractPythonReferences(file: SourceFile): PythonReferences {
  const analysis = analyzePythonFile(file);
  return { imports: analysis.imports, hasDynamicImports: analysis.hasDynamicImports };
}

export function extractPythonEnvironmentReferences(file: SourceFile): PythonEnvironmentReference[] {
  return analyzePythonFile(file).environmentReferences;
}

export function pythonModuleName(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.py$/, '');
  const modulePath = withoutExtension.endsWith('/__init__')
    ? withoutExtension.slice(0, -'/__init__'.length)
    : withoutExtension;
  return modulePath.replaceAll('/', '.');
}

export function buildPythonModuleIndex(files: SourceFile[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files.filter((candidate) => candidate.extension === '.py')) {
    const module = pythonModuleName(file.relativePath);
    if (module) index.set(module, file.relativePath);
    if (module.startsWith('src.')) index.set(module.slice('src.'.length), file.relativePath);
  }
  return index;
}

function importerPackage(file: SourceFile): string[] {
  const module = pythonModuleName(file.relativePath).split('.').filter(Boolean);
  if (path.posix.basename(file.relativePath) !== '__init__.py') module.pop();
  return module;
}

export function resolvePythonImport(
  importer: SourceFile,
  reference: PythonImport,
  moduleIndex: ReadonlyMap<string, string>,
): string[] {
  const targets = new Set<string>();
  let baseParts: string[];
  if (reference.level > 0) {
    baseParts = importerPackage(importer);
    baseParts.splice(Math.max(0, baseParts.length - (reference.level - 1)));
    if (reference.module) baseParts.push(...reference.module.split('.'));
  } else {
    baseParts = reference.module.split('.').filter(Boolean);
  }

  const base = baseParts.join('.');
  const addModule = (module: string): void => {
    const direct = moduleIndex.get(module);
    if (direct) targets.add(direct);
    if (!direct && reference.level === 0) {
      const sibling = [...importerPackage(importer), ...module.split('.')].join('.');
      const siblingTarget = moduleIndex.get(sibling);
      if (siblingTarget) targets.add(siblingTarget);
    }
  };
  if (base) addModule(base);
  for (const name of reference.names) {
    if (name !== '*') addModule(base ? `${base}.${name}` : name);
  }
  return [...targets];
}

export function importedPythonModules(files: SourceFile[]): Set<string> {
  const modules = new Set<string>();
  for (const file of files.filter((candidate) => candidate.extension === '.py')) {
    for (const reference of extractPythonReferences(file).imports) {
      if (reference.module) modules.add(reference.module);
      for (const name of reference.names) {
        if (reference.level === 0 && name !== '*') {
          modules.add(reference.module ? `${reference.module}.${name}` : name);
        }
      }
    }
  }
  return modules;
}
