#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { analyzers } from './analyzers/index.js';
import { writeDefaultConfig } from './core/config.js';
import { scanRepository } from './core/scanner.js';
import { FINDING_CATEGORIES, type Confidence, type FindingCategory } from './models/finding.js';
import { renderJson } from './reporters/json.js';
import { renderTerminal } from './reporters/terminal.js';

type OutputFormat = 'text' | 'json';

interface CliScanOptions {
  format: OutputFormat;
  json?: boolean;
  confidence?: Confidence;
  category?: FindingCategory;
  failOn?: Confidence;
  since?: string;
}

const confidenceRank: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

function choice<T extends string>(choices: readonly T[], label: string) {
  return (value: string): T => {
    if (!choices.includes(value as T)) {
      throw new InvalidArgumentError(`${label} must be one of: ${choices.join(', ')}`);
    }
    return value as T;
  };
}

async function runScan(target: string, options: CliScanOptions): Promise<void> {
  const root = path.resolve(target);
  await access(root);
  const result = await scanRepository(root, analyzers, {
    ...(options.category ? { categories: [options.category] } : {}),
    ...(options.since ? { since: options.since } : {}),
  });
  if (options.confidence) {
    result.findings = result.findings.filter(
      (finding) => finding.confidence === options.confidence,
    );
  }
  const format = options.json ? 'json' : options.format;
  process.stdout.write(`${format === 'json' ? renderJson(result) : renderTerminal(result)}\n`);

  if (
    options.failOn &&
    result.findings.some(
      (finding) =>
        confidenceRank[finding.confidence] >= confidenceRank[options.failOn as Confidence],
    )
  ) {
    process.exitCode = 1;
  }
}

const program = new Command();
program
  .exitOverride()
  .name('repo-prune')
  .description('Find what your repository no longer needs.')
  .version('0.1.0');

const addScanOptions = (command: Command): Command =>
  command
    .argument('[path]', 'repository path', '.')
    .option('--json', 'shortcut for --format json')
    .option(
      '--format <format>',
      'output format',
      choice(['text', 'json'] as const, 'format'),
      'text',
    )
    .option(
      '--confidence <level>',
      'only show findings with exactly this confidence',
      choice(['high', 'medium', 'low'] as const, 'confidence'),
    )
    .option(
      '--category <category>',
      'only run one analyzer category',
      choice(FINDING_CATEGORIES, 'category'),
    )
    .option(
      '--fail-on <level>',
      'exit 1 when findings at or above this confidence exist',
      choice(['high', 'medium', 'low'] as const, 'fail-on'),
    )
    .option('--since <git-ref>', 'show findings caused by changes since a Git ref')
    .action(runScan);

addScanOptions(program.command('scan').description('scan a repository'));
program
  .command('init')
  .description('create .repo-prune.yml in the current directory')
  .action(async () => {
    const destination = await writeDefaultConfig(process.cwd());
    process.stdout.write(`Created ${destination}\n`);
  });

// A bare `repo-prune` behaves exactly like `repo-prune scan .`.
if (process.argv.length === 2) process.argv.push('scan');

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = ['commander.helpDisplayed', 'commander.version'].includes(error.code)
      ? 0
      : 2;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`repo-prune: ${message}\n`);
    process.exitCode = 2;
  }
}
