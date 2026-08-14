export const FINDING_CATEGORIES = [
  'files',
  'dependencies',
  'config',
  'scripts',
  'docker',
  'duplicates',
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type Confidence = 'high' | 'medium' | 'low';

export interface Evidence {
  type: string;
  message: string;
  path?: string;
  line?: number;
}

export interface Finding {
  id: string;
  category: FindingCategory;
  title: string;
  path?: string;
  line?: number;
  confidence: Confidence;
  supporting: Evidence[];
  contradicting: Evidence[];
  uncertain: Evidence[];
  causedBy?: Evidence[];
  recommendation?: string;
  metadata?: Record<string, unknown>;
}

export interface ScanSummary {
  totalFiles: number;
  scannedFiles: number;
  skippedFiles: number;
  estimatedSavingsBytes: number;
  languageBytes: Record<string, number>;
  inventory: {
    dependencies: number;
    scripts: number;
    dockerStages: number;
  };
  suppressed: {
    safetyConventions: number;
    dynamicPaths: number;
    sinceFilter: number;
  };
  durationMs: number;
}

export interface ScanResult {
  version: string;
  root: string;
  findings: Finding[];
  summary: ScanSummary;
}
