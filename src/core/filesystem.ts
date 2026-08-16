import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PathIgnore } from './ignore.js';

export interface RepositoryFile {
  absolutePath: string;
  relativePath: string;
  size: number;
  extension: string;
}

export interface WalkResult {
  files: RepositoryFile[];
  skippedFiles: number;
}

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.avif',
  '.avi',
  '.bmp',
  '.class',
  '.dll',
  '.doc',
  '.docx',
  '.dylib',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lockb',
  '.mov',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.pyc',
  '.so',
  '.sqlite',
  '.tar',
  '.tif',
  '.tiff',
  '.ttf',
  '.wasm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

async function hasNullByte(filePath: string, size: number): Promise<boolean> {
  if (size === 0) return false;
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(8192, size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

export async function walkRepository(
  root: string,
  pathIgnore: PathIgnore,
  maxFileSize: number,
): Promise<WalkResult> {
  const files: RepositoryFile[] = [];
  let skippedFiles = 0;
  const pending = [''];

  while (pending.length > 0) {
    const relativeDirectory = pending.pop() ?? '';
    const absoluteDirectory = path.join(root, relativeDirectory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = path.join(relativeDirectory, entry.name).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!pathIgnore.ignores(relativePath, true)) pending.push(relativePath);
        continue;
      }
      if (!entry.isFile() || pathIgnore.ignores(relativePath)) continue;

      const extension = path.extname(entry.name).toLowerCase();
      const absolutePath = path.join(root, relativePath);
      const fileStat = await stat(absolutePath);
      if (
        fileStat.size > maxFileSize ||
        BINARY_EXTENSIONS.has(extension) ||
        (await hasNullByte(absolutePath, fileStat.size))
      ) {
        skippedFiles += 1;
        continue;
      }
      files.push({ absolutePath, relativePath, size: fileStat.size, extension });
    }
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { files, skippedFiles };
}
