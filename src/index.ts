export { scanRepository, type ScanOptions } from './core/scanner.js';
export { loadConfig, type RepoPruneConfig } from './core/config.js';
export type {
  Confidence,
  Evidence,
  Finding,
  FindingCategory,
  ScanResult,
  ScanSummary,
} from './models/finding.js';
