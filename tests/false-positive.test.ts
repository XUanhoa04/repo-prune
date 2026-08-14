import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deadFilesAnalyzer } from '../src/analyzers/dead-files.js';
import { scanRepository } from '../src/core/scanner.js';

const fixture = (name: string): string => path.resolve('tests', 'fixtures', name);

describe('false-positive regression fixtures', () => {
  it('downgrades candidates when the repository contains runtime imports', async () => {
    const result = await scanRepository(fixture('dynamic-import'), [deadFilesAnalyzer]);
    const reconcile = result.findings.find((finding) => finding.path === 'src/jobs/reconcile.ts');
    expect(reconcile?.confidence).toBe('medium');
    expect(reconcile?.uncertain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dynamic-import', path: 'src/loader.ts', line: 2 }),
      ]),
    );
  });

  it('suppresses Next.js convention files and reports the detected framework', async () => {
    const result = await scanRepository(fixture('nextjs-app'), [deadFilesAnalyzer]);
    expect(result.findings).toHaveLength(0);
    expect(result.summary.inventory.frameworks).toContain('Next.js');
    expect(result.summary.suppressed.safetyConventions).toBeGreaterThanOrEqual(2);
  });

  it('resolves CommonJS require calls while still finding an orphan', async () => {
    const result = await scanRepository(fixture('commonjs-require'), [deadFilesAnalyzer]);
    expect(result.findings.map((finding) => finding.path)).toEqual(['legacy.js']);
  });
});
