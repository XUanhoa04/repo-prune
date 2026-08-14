import { describe, expect, it } from 'vitest';
import { dependenciesAnalyzer } from '../src/analyzers/dependencies.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('dependency analyzer', () => {
  it('reports an unimported dependency and keeps an imported one', async () => {
    const root = await createFixture({
      'package.json': JSON.stringify({ dependencies: { axios: '1.0.0', moment: '2.0.0' } }),
      'index.ts': "import axios from 'axios';\nexport { axios };\n",
    });
    const result = await scanRepository(root, [dependenciesAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.dependency)).toEqual(['moment']);
  });
});
