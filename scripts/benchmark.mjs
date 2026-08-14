import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const benchmarkRoot = mkdtempSync(path.join(tmpdir(), 'repo-prune-benchmark-'));
const sourceRoot = path.join(benchmarkRoot, 'src');
const liveFiles = 900;
const deadFiles = 100;

try {
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(
    path.join(benchmarkRoot, 'package.json'),
    JSON.stringify({ private: true, main: 'src/index.ts' }),
  );
  writeFileSync(path.join(sourceRoot, 'index.ts'), "import './live-0.js';\n");
  for (let index = 0; index < liveFiles; index += 1) {
    const next = index + 1 < liveFiles ? `import './live-${index + 1}.js';\n` : '';
    writeFileSync(
      path.join(sourceRoot, `live-${index}.ts`),
      `${next}export const value = ${index};\n`,
    );
  }
  for (let index = 0; index < deadFiles; index += 1) {
    writeFileSync(path.join(sourceRoot, `dead-${index}.ts`), `export const dead = ${index};\n`);
  }

  const startedAt = performance.now();
  const run = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, 'dist', 'cli.js'),
      'scan',
      benchmarkRoot,
      '--category',
      'files',
      '--format',
      'json',
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr || 'benchmark scan failed');
  const result = JSON.parse(run.stdout);
  const detectedDeadFiles = result.findings.filter(
    (finding) => finding.category === 'files',
  ).length;
  const wallTime = Math.round(performance.now() - startedAt);
  process.stdout.write(
    [
      'Synthetic fixture precision benchmark (not production accuracy)',
      `Files: ${liveFiles + deadFiles + 1}`,
      `Known dead files: ${deadFiles}`,
      `Detected dead files: ${detectedDeadFiles}`,
      `Fixture false positives: ${Math.max(0, detectedDeadFiles - deadFiles)}`,
      `Engine scan time: ${result.summary.durationMs} ms`,
      `Wall time: ${wallTime} ms`,
    ].join('\n') + '\n',
  );
  if (detectedDeadFiles !== deadFiles) process.exitCode = 1;
} finally {
  rmSync(benchmarkRoot, { recursive: true, force: true });
}
