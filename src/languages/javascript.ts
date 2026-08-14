import path from 'node:path';
import ts from 'typescript';
import type { SourceFile } from '../core/repository.js';

export const JAVASCRIPT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);

export interface JavaScriptReferences {
  specifiers: string[];
  hasNonLiteralDynamicImport: boolean;
}

function scriptKind(extension: string): ts.ScriptKind {
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export function isJavaScriptFile(file: SourceFile): boolean {
  return JAVASCRIPT_EXTENSIONS.has(file.extension);
}

export function extractJavaScriptReferences(file: SourceFile): JavaScriptReferences {
  const source = ts.createSourceFile(
    file.relativePath,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file.extension),
  );
  const specifiers: string[] = [];
  let hasNonLiteralDynamicImport = false;

  const addModuleSpecifier = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const firstArgument = node.arguments[0];
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamicImport) {
        if (firstArgument && ts.isStringLiteralLike(firstArgument)) {
          specifiers.push(firstArgument.text);
        } else {
          hasNonLiteralDynamicImport = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers: [...new Set(specifiers)], hasNonLiteralDynamicImport };
}

export function packageNameFromSpecifier(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return undefined;
  }
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

export function resolveJavaScriptImport(
  importer: SourceFile,
  specifier: string,
  knownPaths: ReadonlySet<string>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const importerDirectory = path.posix.dirname(importer.relativePath);
  const base = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  const extensions = [...JAVASCRIPT_EXTENSIONS, '.json'];
  const suppliedExtension = path.posix.extname(base);
  const extensionlessBase = suppliedExtension ? base.slice(0, -suppliedExtension.length) : base;
  const candidates = [
    base,
    // TypeScript projects commonly keep `.js` in source imports so emitted ESM is valid.
    ...(suppliedExtension ? extensions.map((extension) => `${extensionlessBase}${extension}`) : []),
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.posix.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => knownPaths.has(candidate));
}
