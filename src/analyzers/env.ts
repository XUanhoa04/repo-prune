import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Analyzer, RepositoryContext, SourceFile } from '../core/repository.js';
import { isJavaScriptFile } from '../languages/javascript.js';
import type { Finding } from '../models/finding.js';
import { assessConfidence } from '../core/confidence.js';

const ENV_TEMPLATE_NAMES = new Set([
  '.env.example',
  '.env.template',
  '.env.sample',
  '.env.dist',
  '.env.defaults',
  '.env.local.example',
]);

interface Declaration {
  key: string;
  path: string;
  line: number;
  kind: 'environment' | 'config';
}

interface CodeReference {
  key: string;
  path: string;
  line: number;
}

function envDeclarations(file: SourceFile): Declaration[] {
  const declarations: Declaration[] = [];
  for (const [index, line] of file.content.split(/\r?\n/).entries()) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match?.[1]) {
      declarations.push({
        key: match[1],
        path: file.relativePath,
        line: index + 1,
        kind: 'environment',
      });
    }
  }
  return declarations;
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function configurationDeclarations(file: SourceFile): Declaration[] {
  if (!/(^|\/)config\.(?:json|ya?ml)$/i.test(file.relativePath)) return [];
  try {
    const value =
      file.extension === '.json' ? (JSON.parse(file.content) as unknown) : parseYaml(file.content);
    return flattenKeys(value).map((key) => {
      const leaf = key.split('.').at(-1) ?? key;
      const line =
        file.content.split(/\r?\n/).findIndex((candidate) => candidate.includes(leaf)) + 1 || 1;
      return { key, path: file.relativePath, line, kind: 'config' as const };
    });
  } catch {
    return [];
  }
}

function codeReferences(context: RepositoryContext): CodeReference[] {
  return [...context.referenceIndex.environmentReferences].flatMap(([key, locations]) =>
    locations.map((location) => ({ key, ...location })),
  );
}

function codeMentionsConfigKey(context: RepositoryContext, key: string): boolean {
  const leaf = key.split('.').at(-1) ?? key;
  const escaped = leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`);
  return context.sourceFiles.some(
    (file) => (isJavaScriptFile(file) || file.extension === '.py') && pattern.test(file.content),
  );
}

function dynamicConfigurationEvidence(context: RepositoryContext) {
  return context.sourceFiles
    .flatMap((file) =>
      file.content.split(/\r?\n/).flatMap((line, index) =>
        /process\.env\s*\[\s*[^'"\s]|import\.meta\.env\s*\[\s*[^'"\s]|os\.(?:getenv|environ\.get)\(\s*[^'"]/.test(
          line,
        )
          ? [
              {
                type: 'dynamic-config',
                message: 'computed environment-variable access detected',
                path: file.relativePath,
                line: index + 1,
              },
            ]
          : [],
      ),
    )
    .slice(0, 2);
}

export const envAnalyzer: Analyzer = {
  name: 'config',
  async analyze(context): Promise<Finding[]> {
    const envFiles = context.sourceFiles.filter((file) =>
      ENV_TEMPLATE_NAMES.has(path.posix.basename(file.relativePath)),
    );
    const declarations = context.sourceFiles.flatMap((file) => [
      ...(ENV_TEMPLATE_NAMES.has(path.posix.basename(file.relativePath))
        ? envDeclarations(file)
        : []),
      ...configurationDeclarations(file),
    ]);
    const references = codeReferences(context);
    const referencedKeys = new Set(references.map((reference) => reference.key));
    const documentedKeys = new Set(
      declarations
        .filter((declaration) => declaration.kind === 'environment')
        .map((declaration) => declaration.key),
    );
    const findings: Finding[] = [];
    const dynamicAccess = dynamicConfigurationEvidence(context);

    for (const declaration of declarations) {
      const isUsed =
        declaration.kind === 'environment'
          ? referencedKeys.has(declaration.key)
          : codeMentionsConfigKey(context, declaration.key);
      if (isUsed) continue;
      const supporting = [
        { type: 'declaration', message: `${declaration.key} is declared here` },
        { type: 'references', message: 'zero supported code references detected' },
        ...(declaration.kind === 'environment'
          ? [{ type: 'templates', message: 'the variable is present in an environment template' }]
          : []),
      ];
      const uncertain = [
        ...dynamicAccess,
        {
          type: 'external-config',
          message: 'deployment systems outside the repository may consume this value',
        },
      ];
      const assessment = assessConfidence(supporting, [], uncertain);
      findings.push({
        id: `config:unused:${declaration.path}:${declaration.key}`,
        category: 'config',
        title:
          declaration.kind === 'environment'
            ? 'Potentially unused environment variable'
            : 'Potentially unused configuration key',
        path: declaration.path,
        line: declaration.line,
        confidence: assessment.level,
        supporting,
        contradicting: [],
        uncertain,
        recommendation: `Confirm deployment usage of ${declaration.key} before changing the template or config.`,
        metadata: { key: declaration.key, kind: declaration.kind, references: 0 },
      });
    }

    if (envFiles.length > 0) {
      const firstReferenceByKey = new Map<string, CodeReference>();
      for (const reference of references) {
        if (!firstReferenceByKey.has(reference.key))
          firstReferenceByKey.set(reference.key, reference);
      }
      for (const [key, reference] of firstReferenceByKey) {
        if (documentedKeys.has(key)) continue;
        const supporting = [
          { type: 'usage', message: `${key} is read by application code` },
          {
            type: 'documentation',
            message: `not documented in ${envFiles.map((file) => file.relativePath).join(', ')}`,
          },
          { type: 'templates', message: `${envFiles.length} environment template(s) were checked` },
        ];
        const assessment = assessConfidence(supporting);
        findings.push({
          id: `config:undocumented:${key}`,
          category: 'config',
          title: 'Missing documented environment variable',
          path: reference.path,
          line: reference.line,
          confidence: assessment.level,
          supporting,
          contradicting: [],
          uncertain: [],
          recommendation: `Document ${key} in the environment template with a safe example value.`,
          metadata: {
            key,
            usedAt: `${reference.path}:${reference.line}`,
            missingFrom: envFiles.map((file) => file.relativePath),
          },
        });
      }
    }
    return findings;
  },
};
