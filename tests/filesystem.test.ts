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
});
