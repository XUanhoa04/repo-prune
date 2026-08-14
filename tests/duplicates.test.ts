import { describe, expect, it } from 'vitest';
import { duplicatesAnalyzer } from '../src/analyzers/duplicates.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('duplicate analyzer', () => {
  it('reports identical files as review-only evidence', async () => {
    const content = 'export const paymentConfiguration = { timeout: 5000 };\n';
    const root = await createFixture({
      'src/config.ts': content,
      'src/config_backup.ts': content,
    });
    const result = await scanRepository(root, [duplicatesAnalyzer]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      title: 'Suspicious duplicate files',
      metadata: { similarity: 100, action: 'REVIEW' },
    });
  });
});
