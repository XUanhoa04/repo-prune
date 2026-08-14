import { describe, expect, it } from 'vitest';
import { deadFilesAnalyzer } from '../src/analyzers/dead-files.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('dead file analyzer', () => {
  it('finds an unreferenced file without flagging imported code', async () => {
    const root = await createFixture({
      'src/main.ts': "import './user.js';\n",
      'src/user.ts': 'export const user = true;\n',
      'src/legacy.ts': 'export const legacy = true;\n',
    });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings.map((finding) => finding.path)).toContain('src/legacy.ts');
    expect(result.findings.map((finding) => finding.path)).not.toContain('src/user.ts');
  });

  it('does not flag a conventional index entrypoint', async () => {
    const root = await createFixture({ 'index.ts': 'export const api = true;\n' });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag configured dynamic import paths', async () => {
    const root = await createFixture({
      '.repo-prune.yml': 'version: 1\ndynamic_import_paths:\n  - plugins/**\n',
      'plugins/payment.ts': 'export default {};\n',
    });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings).toHaveLength(0);
  });

  it('treats files invoked by package scripts as entrypoints', async () => {
    const root = await createFixture({
      'package.json': JSON.stringify({ scripts: { worker: 'node src/worker.ts' } }),
      'src/worker.ts': 'export const run = true;\n',
    });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings).toHaveLength(0);
  });
});
