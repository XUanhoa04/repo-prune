import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkRepository } from '../src/core/filesystem.js';
import { createPathIgnore } from '../src/core/ignore.js';

describe('filesystem walker', () => {
  it('respects defaults and configured ignore paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-prune-'));
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'dist'));
    await writeFile(path.join(root, 'src', 'main.ts'), 'export {};');
    await writeFile(path.join(root, 'src', 'ignored.ts'), 'export {};');
    await writeFile(path.join(root, 'dist', 'bundle.js'), 'ignored');
    const matcher = await createPathIgnore(root, ['src/ignored.ts']);
    const result = await walkRepository(root, matcher, 1024);
    expect(result.files.map((file) => file.relativePath)).toEqual(['src/main.ts']);
  });

  it('skips extended binary file types like webp and wasm', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'repo-prune-'));
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'hero.webp'), 'fake-binary');
    await writeFile(path.join(root, 'assets', 'module.wasm'), 'fake-binary');
    await writeFile(path.join(root, 'assets', 'data.ts'), 'export const data = 1;');
    const matcher = await createPathIgnore(root, []);
    const result = await walkRepository(root, matcher, 1024);
    expect(result.files.map((file) => file.relativePath)).toEqual(['assets/data.ts']);
    expect(result.skippedFiles).toBe(2);
  });
});
