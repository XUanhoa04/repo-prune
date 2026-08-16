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

  it('exempts common Python CLI dev packages and resolves pyjwt/dotenv imports', async () => {
    const root = await createFixture({
      'requirements.txt': [
        'pytest==8.0',
        'pre-commit==3.7',
        'ruff==0.4',
        'pyjwt==2.8',
        'python-dotenv==1.0',
      ].join('\n'),
      'main.py': [
        'import jwt',
        'from dotenv import load_dotenv',
        'from os import environ, getenv',
        'API_KEY = getenv("SECRET_KEY")',
        'DB_HOST = environ.get("DATABASE_HOST")',
      ].join('\n'),
    });
    const result = await scanRepository(root, [dependenciesAnalyzer]);
    expect(result.findings).toHaveLength(0);
  });
});
