import { describe, expect, it } from 'vitest';
import { npmScriptsAnalyzer } from '../src/analyzers/npm-scripts.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('npm script analyzer', () => {
  it('reports an unreferenced non-standard script', async () => {
    const root = await createFixture({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest', 'test:unit': 'vitest unit', 'legacy-test': 'jest legacy' },
      }),
      'README.md': 'Run `npm run test:unit`.\n',
    });
    const result = await scanRepository(root, [npmScriptsAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.script)).toEqual(['legacy-test']);
  });
});
