import { describe, expect, it } from 'vitest';
import { dockerAnalyzer } from '../src/analyzers/docker.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('Docker analyzer', () => {
  it('reports an unreferenced non-final stage', async () => {
    const root = await createFixture({
      Dockerfile: [
        'FROM node:22 AS base',
        'FROM base AS test-base',
        'RUN npm test',
        'FROM base AS builder',
        'RUN npm run build',
        'FROM node:22 AS production',
        'COPY --from=builder /app/dist /app',
      ].join('\n'),
    });
    const result = await scanRepository(root, [dockerAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.stage)).toEqual(['test-base']);
  });
});
