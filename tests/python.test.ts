import { describe, expect, it } from 'vitest';
import { deadFilesAnalyzer } from '../src/analyzers/dead-files.js';
import { dependenciesAnalyzer } from '../src/analyzers/dependencies.js';
import { scanRepository } from '../src/core/scanner.js';
import { createFixture } from './helpers.js';

describe('Python support', () => {
  it('finds an unreferenced Python file and resolves a sibling import', async () => {
    const root = await createFixture({
      'src/main.py': 'import user\n',
      'src/user.py': 'USER = True\n',
      'src/legacy.py': 'LEGACY = True\n',
    });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings.map((finding) => finding.path)).toContain('src/legacy.py');
    expect(result.findings.map((finding) => finding.path)).not.toContain('src/user.py');
  });

  it('respects a pyproject CLI entrypoint', async () => {
    const root = await createFixture({
      'pyproject.toml': '[project]\nname="demo"\n[project.scripts]\ndemo="package.cli:main"\n',
      'package/__init__.py': '',
      'package/cli.py': 'def main(): pass\n',
    });
    const result = await scanRepository(root, [deadFilesAnalyzer]);
    expect(result.findings).toHaveLength(0);
  });

  it('uses distribution-to-import mapping for Python dependencies', async () => {
    const root = await createFixture({
      'requirements.txt': 'scikit-learn==1.0\nbeautifulsoup4==4.0\n',
      'main.py': 'import sklearn\n',
    });
    const result = await scanRepository(root, [dependenciesAnalyzer]);
    expect(result.findings.map((finding) => finding.metadata?.dependency)).toEqual([
      'beautifulsoup4',
    ]);
  });
});
