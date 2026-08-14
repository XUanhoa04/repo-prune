import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.resolve(projectRoot, 'dist');

if (path.dirname(buildDirectory) !== projectRoot || path.basename(buildDirectory) !== 'dist') {
  throw new Error(`Refusing to clean unexpected build path: ${buildDirectory}`);
}

rmSync(buildDirectory, { recursive: true, force: true });
