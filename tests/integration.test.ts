import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzers } from '../src/analyzers/index.js';
import { scanRepository } from '../src/core/scanner.js';
import { renderJson } from '../src/reporters/json.js';

describe('demo repository integration', () => {
  it('runs every required analyzer through the shared scanner', async () => {
    const root = path.resolve('examples/demo-repo');
    const result = await scanRepository(root, analyzers);
    const categories = new Set(result.findings.map((finding) => finding.category));
    for (const required of ['files', 'dependencies', 'config', 'scripts', 'docker', 'duplicates']) {
      expect(categories).toContain(required);
    }
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Potential dead file' }),
        expect.objectContaining({ title: 'Potentially unused dependency' }),
        expect.objectContaining({ title: 'Potentially unused environment variable' }),
        expect.objectContaining({ title: 'Missing documented environment variable' }),
        expect.objectContaining({ title: 'Possibly unused npm script' }),
        expect.objectContaining({ title: 'Potential unused Docker stage' }),
        expect.objectContaining({ title: 'Suspicious duplicate files' }),
      ]),
    );
    expect(JSON.parse(renderJson(result))).toMatchObject({ version: '0.1.0' });
  });
});
