import { describe, expect, it } from 'vitest';
import { envAnalyzer } from '../src/analyzers/env.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('environment analyzer', () => {
  it('finds declared-but-unused and used-but-undocumented variables', async () => {
    const root = await createFixture({
      '.env.example': 'OLD_PAYMENT_ENDPOINT=https://old.example\nDOCUMENTED=true\n',
      'src/config.ts':
        'export const documented = process.env.DOCUMENTED;\nexport const database = process.env["DATABASE_URL"];\n',
    });
    const result = await scanRepository(root, [envAnalyzer]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ key: 'OLD_PAYMENT_ENDPOINT' }),
        }),
        expect.objectContaining({ metadata: expect.objectContaining({ key: 'DATABASE_URL' }) }),
      ]),
    );
    expect(result.findings.map((finding) => finding.metadata?.key)).not.toContain('DOCUMENTED');
  });
});
