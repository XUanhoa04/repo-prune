import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, writeDefaultConfig } from '../src/core/config.js';

describe('configuration', () => {
  it('loads safe defaults when no config exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-prune-'));
    const config = await loadConfig(root);
    expect(config.version).toBe(1);
    expect(config.thresholds.max_file_size_bytes).toBe(5 * 1024 * 1024);
  });

  it('writes a usable default config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-prune-'));
    const destination = await writeDefaultConfig(root);
    expect(await readFile(destination, 'utf8')).toContain('dynamic_import_paths');
    await expect(loadConfig(root)).resolves.toMatchObject({ version: 1 });
  });

  it('rejects an empty configuration document', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-prune-'));
    await writeFile(path.join(root, '.repo-prune.yml'), '', 'utf8');
    await expect(loadConfig(root)).rejects.toThrow('must contain a YAML object');
  });
});
