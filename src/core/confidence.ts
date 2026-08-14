import type { Confidence, Evidence } from '../models/finding.js';

export interface ConfidenceAssessment {
  level: Confidence;
  supporting: Evidence[];
  contradicting: Evidence[];
  uncertain: Evidence[];
}

/**
 * Explainable tiers deliberately avoid a pseudo-precise numeric probability.
 * Strong findings need several independent signals and no direct contradiction.
 */
export function assessConfidence(
  supporting: Evidence[],
  contradicting: Evidence[] = [],
  uncertain: Evidence[] = [],
): ConfidenceAssessment {
  let level: Confidence;
  if (supporting.length <= 1 || contradicting.length >= 2) {
    level = 'low';
  } else if (supporting.length >= 3 && contradicting.length === 0 && uncertain.length <= 1) {
    level = 'high';
  } else {
    level = 'medium';
  }
  return { level, supporting, contradicting, uncertain };
}
