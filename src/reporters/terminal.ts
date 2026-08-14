import pc from 'picocolors';
import type { Confidence, Finding, ScanResult } from '../models/finding.js';

function confidenceLabel(confidence: Confidence): string {
  const label = confidence.toUpperCase().padEnd(6);
  if (confidence === 'high') return pc.red(pc.bold(label));
  if (confidence === 'medium') return pc.yellow(pc.bold(label));
  return pc.blue(pc.bold(label));
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function renderFinding(finding: Finding): string[] {
  const location = finding.path
    ? `${finding.path}${finding.line === undefined ? '' : `:${finding.line}`}`
    : undefined;
  const lines = ['', pc.bold(finding.title), ''];
  if (location) lines.push(pc.cyan(location), '');
  lines.push(`Confidence: ${confidenceLabel(finding.confidence)}`, '', pc.bold('Evidence'));
  lines.push(...finding.evidence.map((evidence) => `  - ${evidence.message}`));
  if (finding.whyThisMayBeWrong) {
    lines.push('', pc.bold('Why this may be wrong'), `  ${finding.whyThisMayBeWrong}`);
  }
  if (finding.recommendation) {
    lines.push('', pc.bold('Recommended action'), `  ${finding.recommendation}`);
  }
  return lines;
}

export function renderTerminal(result: ScanResult): string {
  const counts: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  for (const finding of result.findings) counts[finding.confidence] += 1;
  const totalBytes = Object.values(result.summary.languageBytes).reduce(
    (sum, value) => sum + value,
    0,
  );
  const languageLines = Object.entries(result.summary.languageBytes)
    .sort(([, left], [, right]) => right - left)
    .map(([language, value]) => {
      const percent = totalBytes === 0 ? 0 : Math.round((value / totalBytes) * 100);
      return `  ${language}: ${percent}%`;
    });

  const lines = [
    pc.bold(`repo-prune v${result.version}`),
    '',
    pc.bold('Repository'),
    '',
    `Path: ${result.root}`,
    `Files: ${result.summary.totalFiles.toLocaleString()}`,
    'Languages:',
    ...languageLines,
    '',
    pc.bold('Findings'),
    '',
    `${confidenceLabel('high')} ${counts.high}`,
    `${confidenceLabel('medium')} ${counts.medium}`,
    `${confidenceLabel('low')} ${counts.low}`,
  ];

  for (const finding of result.findings) lines.push(...renderFinding(finding));

  lines.push(
    '',
    pc.bold('Summary'),
    '',
    `Findings: ${result.findings.length}`,
    `Estimated disk saving: ${bytes(result.summary.estimatedSavingsBytes)}`,
    `Completed in: ${result.summary.durationMs} ms`,
    '',
    pc.bold('repo-prune NEVER deletes files automatically.'),
    'repo-prune uses static analysis and heuristics. Dynamic imports, reflection, runtime',
    'discovery and framework conventions can produce false positives.',
    '',
    'Always review findings before deletion.',
  );
  return lines.join('\n');
}
