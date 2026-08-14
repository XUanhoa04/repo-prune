import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { deadFilesAnalyzer } from '../src/analyzers/dead-files.js';
import { dependenciesAnalyzer } from '../src/analyzers/dependencies.js';
import { envAnalyzer } from '../src/analyzers/env.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

const execFileAsync = promisify(execFile);

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

describe('--since', () => {
  it('shows artifacts orphaned by a branch change with causal evidence', async () => {
    const root = await createFixture({
      'package.json': JSON.stringify({
        main: 'src/index.ts',
        dependencies: { moment: '2.0.0' },
      }),
      '.env.example': 'OLD_FLAG=true\n',
      'src/index.ts': "import './handler.js';\n",
      'src/handler.ts': [
        "import './legacy.js';",
        "import moment from 'moment';",
        'export const old = process.env.OLD_FLAG + moment();',
      ].join('\n'),
      'src/legacy.ts': 'export const legacy = true;\n',
    });
    await git(root, 'init', '-b', 'main');
    await git(root, 'config', 'user.email', 'repo-prune@example.test');
    await git(root, 'config', 'user.name', 'repo-prune tests');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'add legacy feature');

    await writeFile(path.join(root, 'src', 'handler.ts'), 'export const current = true;\n');
    await git(root, 'add', '.');
    await git(root, 'commit', '-m', 'remove legacy feature');

    const result = await scanRepository(
      root,
      [deadFilesAnalyzer, dependenciesAnalyzer, envAnalyzer],
      {
        since: 'HEAD~1',
      },
    );
    expect(result.scope).toMatchObject({ since: 'HEAD~1', changedFiles: 1 });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/legacy.ts', category: 'files' }),
        expect.objectContaining({ metadata: expect.objectContaining({ dependency: 'moment' }) }),
        expect.objectContaining({ metadata: expect.objectContaining({ key: 'OLD_FLAG' }) }),
      ]),
    );
    for (const finding of result.findings) {
      expect(finding.causedBy?.[0]?.path).toBe('src/handler.ts');
    }
  });
});
