export { scanRepository, type ScanOptions } from './core/scanner.js';
export { loadConfig, type RepoPruneConfig } from './core/config.js';
export { assessConfidence, type ConfidenceAssessment } from './core/confidence.js';
export type {
  DependencyDeclaration,
  ReferenceIndex,
  RepositorySignal,
} from './core/reference-index.js';
export type {
  Confidence,
  Evidence,
  Finding,
  FindingCategory,
  ScanResult,
  ScanSummary,
} from './models/finding.js';
