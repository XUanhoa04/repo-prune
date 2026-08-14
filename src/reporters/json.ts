import type { ScanResult } from '../models/finding.js';

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
