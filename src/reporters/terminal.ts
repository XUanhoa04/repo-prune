import pc from 'picocolors';
import type { Confidence, Evidence, Finding, ScanResult } from '../models/finding.js';

const DIVIDER = '─'.repeat(72);

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

function evidenceLocation(evidence: Evidence): string {
  if (!evidence.path) return '';
  return pc.dim(` (${evidence.path}${evidence.line ? `:${evidence.line}` : ''})`);
}

function renderEvidence(
  symbol: string,
  evidence: Evidence,
  color: (value: string) => string,
): string {
  return `  ${color(symbol)} ${evidence.message}${evidenceLocation(evidence)}`;
}

function renderFinding(finding: Finding): string[] {
  const location = finding.path
    ? `${finding.path}${finding.line === undefined ? '' : `:${finding.line}`}`
    : finding.title;
  const lines = [
    '',
    pc.dim(DIVIDER),
    '',
    `${confidenceLabel(finding.confidence)} ${pc.bold(pc.cyan(location))}`,
    pc.dim(`       ${finding.title}`),
    '',
    pc.bold(finding.category === 'files' ? 'Looks removable because' : 'Why it was flagged'),
    ...finding.supporting.map((evidence) => renderEvidence('✓', evidence, pc.green)),
  ];

  if (finding.causedBy && finding.causedBy.length > 0) {
    lines.push(
      '',
      pc.bold('Branch evidence'),
      ...finding.causedBy.map((evidence) => renderEvidence('↳', evidence, pc.magenta)),
    );
  }
  const caveats = [...finding.contradicting, ...finding.uncertain];
  if (caveats.length > 0) {
    lines.push(
      '',
      pc.bold('Possible caveat'),
      ...caveats.map((evidence) => renderEvidence('!', evidence, pc.yellow)),
    );
  }
  if (finding.recommendation) {
    lines.push('', pc.bold('Suggested review'), `  ${pc.cyan('→')} ${finding.recommendation}`);
  }
  return lines;
}

export function renderTerminal(result: ScanResult): string {
  const counts: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  for (const finding of result.findings) counts[finding.confidence] += 1;
  const inventory = result.summary.inventory;
  const lines = [
    pc.bold(`repo-prune v${result.version}`),
    pc.dim(result.root),
    '',
    pc.bold('Repository analyzed'),
    `  ${result.summary.totalFiles.toLocaleString()} files  ${inventory.dependencies} dependencies  ${inventory.scripts} scripts  ${inventory.dockerStages} Docker stages`,
    `  ${confidenceLabel('high')} ${counts.high}    ${confidenceLabel('medium')} ${counts.medium}    ${confidenceLabel('low')} ${counts.low}`,
  ];

  for (const finding of result.findings) lines.push(...renderFinding(finding));

  const suppressed = result.summary.suppressed;
  lines.push(
    '',
    pc.dim(DIVIDER),
    '',
    pc.bold('Summary'),
    `  ${counts.high} high-confidence findings`,
    `  ${counts.medium} medium-confidence findings`,
    `  ${counts.low} low-confidence findings`,
    `  ${suppressed.safetyConventions} unreferenced files suppressed by safety conventions`,
    `  ${suppressed.dynamicPaths} files suppressed by configured dynamic paths`,
    ...(suppressed.sinceFilter > 0
      ? [`  ${suppressed.sinceFilter} unrelated findings hidden by --since`]
      : []),
    `  Estimated candidate file size: ${bytes(result.summary.estimatedSavingsBytes)}`,
    `  Completed in ${result.summary.durationMs} ms`,
    '',
    pc.bold('repo-prune never deletes anything automatically.'),
    'Review the evidence and caveats before removing repository artifacts.',
  );
  return lines.join('\n');
}
