import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Analyzer } from '../core/repository.js';
import type { Finding } from '../models/finding.js';

const SUSPICIOUS_NAME = /(?:[_-](?:old|backup|copy)|[-_]final\d*|\bcopy\b)/i;

export const duplicatesAnalyzer: Analyzer = {
  name: 'duplicates',
  async analyze(context): Promise<Finding[]> {
    const byHash = new Map<string, typeof context.sourceFiles>();
    for (const file of context.sourceFiles) {
      if (file.size < 16 || path.posix.basename(file.relativePath) === 'package-lock.json')
        continue;
      const hash = createHash('sha256').update(file.content).digest('hex');
      const group = byHash.get(hash) ?? [];
      group.push(file);
      byHash.set(hash, group);
    }

    const findings: Finding[] = [];
    const exactDuplicatePaths = new Set<string>();
    for (const [hash, files] of byHash) {
      if (files.length < 2) continue;
      const first = files[0];
      if (!first) continue;
      files.forEach((file) => exactDuplicatePaths.add(file.relativePath));
      findings.push({
        id: `duplicates:hash:${hash.slice(0, 12)}`,
        category: 'duplicates',
        title: 'Suspicious duplicate files',
        path: first.relativePath,
        confidence: 'high',
        evidence: [
          { type: 'hash', message: `identical SHA-256 content hash (${hash.slice(0, 12)}…)` },
          { type: 'similarity', message: 'content similarity is 100%' },
          { type: 'paths', message: files.map((file) => file.relativePath).join(', ') },
        ],
        whyThisMayBeWrong:
          'Identical files can be intentional fixtures, templates, or generated artifacts.',
        recommendation:
          'Review ownership and consumers of every copy; do not remove based on hash alone.',
        metadata: {
          paths: files.map((file) => file.relativePath),
          hash,
          similarity: 100,
          duplicateBytes: (files.length - 1) * first.size,
          action: 'REVIEW',
        },
      });
    }

    for (const file of context.sourceFiles) {
      if (exactDuplicatePaths.has(file.relativePath)) continue;
      if (!SUSPICIOUS_NAME.test(path.posix.basename(file.relativePath, file.extension))) continue;
      findings.push({
        id: `duplicates:name:${file.relativePath}`,
        category: 'duplicates',
        title: 'Suspicious artifact filename',
        path: file.relativePath,
        confidence: 'low',
        evidence: [
          { type: 'filename', message: 'name resembles an old, backup, copy, or final artifact' },
        ],
        whyThisMayBeWrong: 'The filename may be intentional and does not prove the file is unused.',
        recommendation: 'Review the file history and references.',
        metadata: { action: 'REVIEW' },
      });
    }
    return findings;
  },
};
