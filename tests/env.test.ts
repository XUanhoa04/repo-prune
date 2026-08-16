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

  it('recognizes import.meta.env property and element access', async () => {
    const root = await createFixture({
      '.env.example': 'VITE_API_URL=https://api.example\nVITE_APP_NAME=MyApp\n',
      'src/main.ts':
        'const apiUrl = import.meta.env.VITE_API_URL;\nconst appName = import.meta.env["VITE_APP_NAME"];\n',
    });
    const result = await scanRepository(root, [envAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.key)).not.toContain('VITE_API_URL');
    expect(result.findings.map((finding) => finding.metadata?.key)).not.toContain('VITE_APP_NAME');
  });

  it('scans .env.dist and .env.defaults template conventions', async () => {
    const root = await createFixture({
      '.env.dist': 'SERVICE_PORT=8080\nUNUSED_FLAG=true\n',
      'src/server.ts': 'const port = process.env.SERVICE_PORT;\n',
    });
    const result = await scanRepository(root, [envAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.key)).toContain('UNUSED_FLAG');
    expect(result.findings.map((finding) => finding.metadata?.key)).not.toContain('SERVICE_PORT');
  });
});
