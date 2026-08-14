import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = mkdtempSync(path.join(tmpdir(), 'repo-prune-feature-removal-'));

function write(relativePath, content) {
  const destination = path.join(demoRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content, 'utf8');
}

function git(...args) {
  execFileSync('git', ['-C', demoRoot, ...args], { stdio: 'ignore' });
}

try {
  write(
    'package.json',
    JSON.stringify(
      {
        private: true,
        main: 'src/index.ts',
        dependencies: { express: '5.1.0', moment: '2.30.1' },
      },
      null,
      2,
    ),
  );
  write('.env.example', 'PAYMENT_LEGACY_TIMEOUT=5000\n');
  write('src/index.ts', "import './payment/router.js';\n");
  write(
    'src/payment/router.ts',
    [
      "import './legacy-handler.js';",
      "import moment from 'moment';",
      'export const timeout = process.env.PAYMENT_LEGACY_TIMEOUT;',
      'export const migratedAt = moment().toISOString();',
    ].join('\n'),
  );
  write('src/payment/legacy-handler.ts', 'export const gateway = "v1";\n');
  git('init', '-b', 'main');
  git('config', 'user.email', 'demo@repo-prune.dev');
  git('config', 'user.name', 'repo-prune demo');
  git('add', '.');
  git('commit', '-m', 'add legacy payment feature');

  write('src/payment/router.ts', 'export const migrated = true;\n');
  git('add', '.');
  git('commit', '-m', 'remove legacy payment feature');

  process.stdout.write(
    '\nFeature removal demo: the last commit removed legacy payment wiring.\n\n',
  );
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, 'dist', 'cli.js'), 'scan', demoRoot, '--since', 'HEAD~1'],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 2;
} finally {
  rmSync(demoRoot, { recursive: true, force: true });
}
