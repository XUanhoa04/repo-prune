import path from 'node:path';
import type { RepositoryContext } from './repository.js';
import { assessConfidence } from './confidence.js';
import { dependencyDeclarationKey } from './reference-index.js';
import { expectedPythonImports } from '../languages/python-packages.js';
import type { Evidence, Finding, FindingCategory } from '../models/finding.js';

function dependencyConfigReference(
  context: RepositoryContext,
  dependency: string,
  manifestPath: string,
): boolean {
  const directory = path.posix.dirname(manifestPath);
  return context.sourceFiles.some((file) => {
    if (file.relativePath === manifestPath) return false;
    if (directory !== '.' && !file.relativePath.startsWith(`${directory}/`)) return false;
    const isDataConfig = ['.json', '.yaml', '.yml', '.toml'].includes(file.extension);
    const isCodeConfig =
      ['.js', '.cjs', '.mjs', '.ts'].includes(file.extension) &&
      /(?:^|\/)(?:[^/]+\.)?config\.[^.]+$/.test(file.relativePath);
    return (isDataConfig || isCodeConfig) && file.content.includes(dependency);
  });
}

export function correlateFindings(
  findings: Finding[],
  context: RepositoryContext,
  enabledCategories: ReadonlySet<FindingCategory>,
): Finding[] {
  if (!enabledCategories.has('files') || !enabledCategories.has('dependencies')) return findings;
  const deadFileFindings = findings.filter(
    (finding): finding is Finding & { path: string } =>
      finding.category === 'files' && Boolean(finding.path),
  );
  const deadFiles = new Set(deadFileFindings.map((finding) => finding.path));
  const correlated = [...findings];

  for (const declaration of context.referenceIndex.dependencyDeclarations) {
    if (context.config.ignore.dependencies.includes(declaration.name)) continue;
    if (declaration.name.startsWith('@types/')) continue;
    if (
      findings.some(
        (finding) => finding.id === `dependencies:${declaration.path}:${declaration.name}`,
      )
    ) {
      continue;
    }
    const importers = [
      ...(context.referenceIndex.dependencyImporters.get(dependencyDeclarationKey(declaration)) ??
        []),
    ];
    if (importers.length === 0 || !importers.every((importer) => deadFiles.has(importer))) continue;
    const manifest = context.referenceIndex.packageManifests.find(
      (candidate) => candidate.file.relativePath === declaration.path,
    );
    const scripts = Object.values(manifest?.data.scripts ?? {});
    if (scripts.some((script) => script.includes(declaration.name))) continue;
    if (dependencyConfigReference(context, declaration.name, declaration.path)) continue;

    const supporting: Evidence[] = [
      { type: 'declaration', message: `${declaration.name} is declared in ${declaration.path}` },
      {
        type: 'cross-surface',
        message: `only imported by potentially dead files: ${importers.join(', ')}`,
      },
      { type: 'live-importers', message: 'no file outside that dead-file set imports it' },
    ];
    const contradicting: Evidence[] = [
      {
        type: 'dependent-assessment',
        message: 'this conclusion depends on the linked dead-file findings being correct',
      },
    ];
    const uncertain = deadFileFindings
      .filter((finding) => importers.includes(finding.path))
      .flatMap((finding) => [...finding.contradicting, ...finding.uncertain])
      .slice(0, 2);
    const assessment = assessConfidence(supporting, contradicting, uncertain);
    correlated.push({
      id: `dependencies:${declaration.path}:${declaration.name}:dead-importers`,
      category: 'dependencies',
      title: 'Dependency only used by potentially dead files',
      path: declaration.path,
      confidence: assessment.level,
      supporting,
      contradicting,
      uncertain,
      recommendation: `Review ${importers.join(', ')} before uninstalling ${declaration.name}.`,
      metadata: {
        dependency: declaration.name,
        declaredIn: declaration.path,
        ecosystem: declaration.ecosystem,
        importers,
        crossSurface: true,
      },
    });
  }
  return correlated;
}

function previousDependencyImporters(finding: Finding, context: RepositoryContext): Set<string> {
  const dependency = finding.metadata?.dependency;
  if (typeof dependency !== 'string' || !context.gitScope) return new Set();
  const ecosystem = finding.metadata?.ecosystem;
  const names =
    ecosystem === 'python'
      ? expectedPythonImports(dependency)
      : ([dependency] as readonly string[]);
  const importers = new Set<string>();
  for (const name of names) {
    for (const [historicalName, historicalImporters] of context.gitScope.historical
      .packageImporters) {
      if (historicalName === name || historicalName.startsWith(`${name}.`)) {
        for (const importer of historicalImporters) importers.add(importer);
      }
    }
  }
  return importers;
}

function describeHistoricalReference(pathValue: string, context: RepositoryContext): string {
  const change = context.gitScope?.changes.find(
    (candidate) => candidate.path === pathValue || candidate.previousPath === pathValue,
  );
  if (change?.status === 'deleted') return `${pathValue} was deleted in this branch`;
  if (change?.status === 'renamed') return `${pathValue} was renamed or changed in this branch`;
  return `${pathValue} stopped providing this reference in this branch`;
}

function historicalCauses(finding: Finding, context: RepositoryContext): Evidence[] {
  const scope = context.gitScope;
  if (!scope) return [];
  let paths = new Set<string>();
  if (finding.category === 'files' && finding.path) {
    paths = scope.historical.fileImporters.get(finding.path) ?? new Set();
  } else if (finding.category === 'dependencies') {
    paths = previousDependencyImporters(finding, context);
    if (finding.metadata?.crossSurface === true) {
      const currentImporters = Array.isArray(finding.metadata.importers)
        ? finding.metadata.importers.filter((value): value is string => typeof value === 'string')
        : [];
      const linked = currentImporters.filter((importer) =>
        context.gitScope
          ? context.gitScope.changes.some(
              (change) => change.path === importer || change.previousPath === importer,
            )
          : false,
      );
      paths = new Set([...paths, ...linked]);
    }
  } else if (finding.category === 'config' && finding.metadata?.kind === 'environment') {
    const key = finding.metadata.key;
    if (typeof key === 'string') {
      paths = scope.historical.environmentReferences.get(key) ?? new Set();
    }
  } else if (finding.category === 'scripts') {
    const script = finding.metadata?.script;
    if (typeof script === 'string') {
      const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?${escaped}\\b`);
      paths = new Set(
        [...scope.historical.contents]
          .filter(([, content]) => pattern.test(content))
          .map(([historicalPath]) => historicalPath),
      );
    }
  }
  return [...paths].map((historicalPath) => ({
    type: 'branch-cause',
    message: describeHistoricalReference(historicalPath, context),
    path: historicalPath,
  }));
}

function directChangeCause(finding: Finding, context: RepositoryContext): Evidence[] {
  const changes = context.gitScope?.changes ?? [];
  const candidatePaths = new Set<string>();
  if (finding.path) candidatePaths.add(finding.path);
  const metadataPaths = finding.metadata?.paths;
  if (Array.isArray(metadataPaths)) {
    metadataPaths.forEach((value) => {
      if (typeof value === 'string') candidatePaths.add(value);
    });
  }
  const usedAt = finding.metadata?.usedAt;
  if (typeof usedAt === 'string') candidatePaths.add(usedAt.split(':')[0] ?? usedAt);
  const direct = changes.find(
    (change) =>
      change.status !== 'deleted' &&
      [...candidatePaths].some((candidate) => candidate === change.path),
  );
  return direct
    ? [
        {
          type: 'changed-artifact',
          message: `${direct.path} was ${direct.status} in this branch`,
          path: direct.path,
        },
      ]
    : [];
}

export function applyGitScope(
  findings: Finding[],
  context: RepositoryContext,
): { findings: Finding[]; hidden: number } {
  if (!context.gitScope) return { findings, hidden: 0 };
  const scoped: Finding[] = [];
  for (const finding of findings) {
    const causes = historicalCauses(finding, context);
    if (causes.length === 0) causes.push(...directChangeCause(finding, context));
    if (causes.length === 0) continue;
    const supporting = [...finding.supporting, ...causes];
    scoped.push({
      ...finding,
      confidence: assessConfidence(supporting, finding.contradicting, finding.uncertain).level,
      supporting,
      causedBy: causes,
    });
  }
  return { findings: scoped, hidden: findings.length - scoped.length };
}
