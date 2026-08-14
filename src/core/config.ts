import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';

export interface RepoPruneConfig {
  version: 1;
  ignore: {
    paths: string[];
    dependencies: string[];
  };
  entrypoints: string[];
  dynamic_import_paths: string[];
  frameworks: {
    auto_detect: boolean;
  };
  thresholds: {
    stale_todo_days: number;
    max_file_size_bytes: number;
  };
}

export const DEFAULT_CONFIG: RepoPruneConfig = {
  version: 1,
  ignore: {
    paths: [],
    dependencies: [],
  },
  entrypoints: [],
  dynamic_import_paths: [],
  frameworks: {
    auto_detect: true,
  },
  thresholds: {
    stale_todo_days: 180,
    max_file_size_bytes: 5 * 1024 * 1024,
  },
};

const CONFIG_FILENAMES = ['.repo-prune.yml', '.repo-prune.yaml'];

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function strings(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ConfigError(`${field} must be a list of strings`);
  }
  return value;
}

export async function loadConfig(root: string): Promise<RepoPruneConfig> {
  let raw: Record<string, unknown> | undefined;
  for (const filename of CONFIG_FILENAMES) {
    try {
      raw = parse(await readFile(path.join(root, filename), 'utf8')) as Record<string, unknown>;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ConfigError(`Cannot read ${filename}: ${(error as Error).message}`);
      }
    }
  }

  if (!raw) return structuredClone(DEFAULT_CONFIG);
  if (raw.version !== 1) throw new ConfigError('Configuration version must be 1');

  const ignore = (raw.ignore ?? {}) as Record<string, unknown>;
  const frameworks = (raw.frameworks ?? {}) as Record<string, unknown>;
  const thresholds = (raw.thresholds ?? {}) as Record<string, unknown>;
  const staleDays = thresholds.stale_todo_days ?? DEFAULT_CONFIG.thresholds.stale_todo_days;
  const maxSize = thresholds.max_file_size_bytes ?? DEFAULT_CONFIG.thresholds.max_file_size_bytes;

  if (!Number.isInteger(staleDays) || Number(staleDays) < 0) {
    throw new ConfigError('thresholds.stale_todo_days must be a non-negative integer');
  }
  if (!Number.isInteger(maxSize) || Number(maxSize) <= 0) {
    throw new ConfigError('thresholds.max_file_size_bytes must be a positive integer');
  }

  return {
    version: 1,
    ignore: {
      paths: strings(ignore.paths, 'ignore.paths'),
      dependencies: strings(ignore.dependencies, 'ignore.dependencies'),
    },
    entrypoints: strings(raw.entrypoints, 'entrypoints'),
    dynamic_import_paths: strings(raw.dynamic_import_paths, 'dynamic_import_paths'),
    frameworks: {
      auto_detect:
        typeof frameworks.auto_detect === 'boolean'
          ? frameworks.auto_detect
          : DEFAULT_CONFIG.frameworks.auto_detect,
    },
    thresholds: {
      stale_todo_days: Number(staleDays),
      max_file_size_bytes: Number(maxSize),
    },
  };
}

export async function writeDefaultConfig(root: string): Promise<string> {
  const destination = path.join(root, '.repo-prune.yml');
  const document = {
    version: 1,
    ignore: {
      paths: ['migrations/**', 'fixtures/**', 'generated/**', 'vendor/**'],
      dependencies: ['webpack', 'typescript'],
    },
    entrypoints: ['src/main.py', 'src/index.ts'],
    dynamic_import_paths: ['plugins/**', 'handlers/**'],
    frameworks: { auto_detect: true },
    thresholds: { stale_todo_days: 180, max_file_size_bytes: 5242880 },
  };

  try {
    await writeFile(destination, stringify(document), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ConfigError('.repo-prune.yml already exists');
    }
    throw error;
  }
  return destination;
}
