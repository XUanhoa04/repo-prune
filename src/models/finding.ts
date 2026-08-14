export const FINDING_CATEGORIES = [
  'files',
  'dependencies',
  'config',
  'scripts',
  'docker',
  'duplicates',
  'todos',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type Confidence = 'high' | 'medium' | 'low';

export interface Evidence {
  type: string;
  message: string;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  title: string;
  path?: string;
  line?: number;
  confidence: Confidence;
  evidence: Evidence[];
  whyThisMayBeWrong?: string;
  recommendation?: string;
  metadata?: Record<string, unknown>;
}

export interface ScanSummary {
  totalFiles: number;
  scannedFiles: number;
  skippedFiles: number;
  estimatedSavingsBytes: number;
  languageBytes: Record<string, number>;
  durationMs: number;
}

export interface ScanResult {
  version: string;
  root: string;
  findings: Finding[];
  summary: ScanSummary;
}
