import { describe, expect, it } from 'vitest';
import { deadFilesAnalyzer } from '../src/analyzers/dead-files.js';
import { dependenciesAnalyzer } from '../src/analyzers/dependencies.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('cross-surface correlation', () => {
  it('links a dependency that is only imported by a dead file', async () => {
    const root = await createFixture({
      'package.json': JSON.stringify({
        main: 'src/index.ts',
        dependencies: { moment: '2.0.0' },
      }),
      'src/index.ts': 'export const live = true;\n',
      'src/legacy.ts': "import moment from 'moment';\nexport const old = moment();\n",
    });
    const result = await scanRepository(root, [deadFilesAnalyzer, dependenciesAnalyzer]);
    const dependency = result.findings.find(
      (finding) => finding.title === 'Dependency only used by potentially dead files',
    );
    expect(dependency).toMatchObject({
      confidence: 'medium',
      metadata: { dependency: 'moment', importers: ['src/legacy.ts'], crossSurface: true },
    });
    expect(dependency?.supporting.some((evidence) => evidence.type === 'cross-surface')).toBe(true);
  });
});
