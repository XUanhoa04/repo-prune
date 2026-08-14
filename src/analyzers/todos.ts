import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Analyzer, SourceFile } from '../core/repository.js';
import type { Finding } from '../models/finding.js';

const execFileAsync = promisify(execFile);
const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)/;
const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.rb',
  '.php',
]);

async function blameTimes(root: string, file: SourceFile): Promise<Map<number, number>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', root, 'blame', '--line-porcelain', '--', file.relativePath],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const times = new Map<number, number>();
    let finalLine: number | undefined;
    let timestamp: number | undefined;
    let tracked = false;
    for (const line of stdout.split(/\r?\n/)) {
      const header = /^([0-9a-f]{40})\s+\d+\s+(\d+)/.exec(line);
      if (header?.[1] && header[2]) {
        tracked = !/^0+$/.test(header[1]);
        finalLine = Number(header[2]);
        timestamp = undefined;
      } else if (line.startsWith('author-time ')) {
        timestamp = Number(line.slice('author-time '.length)) * 1000;
      } else if (line.startsWith('\t') && tracked && finalLine && timestamp) {
        times.set(finalLine, timestamp);
      }
    }
    return times;
  } catch {
    return new Map();
  }
}

export const todosAnalyzer: Analyzer = {
  name: 'todos',
  async analyze(context): Promise<Finding[]> {
    const findings: Finding[] = [];
    const now = Date.now();
    const threshold = context.config.thresholds.stale_todo_days;
    for (const file of context.sourceFiles.filter((candidate) =>
      SOURCE_EXTENSIONS.has(candidate.extension),
    )) {
      const lines = file.content.split(/\r?\n/);
      if (!lines.some((line) => TODO_PATTERN.test(line))) continue;
      const times = await blameTimes(context.root, file);
      for (const [index, line] of lines.entries()) {
        const match = TODO_PATTERN.exec(line);
        const introducedAt = times.get(index + 1);
        if (!match || !introducedAt) continue;
        const ageDays = Math.floor((now - introducedAt) / 86_400_000);
        if (ageDays < threshold) continue;
        const message = `${match[1]}${match[2] ? `: ${match[2].trim()}` : ''}`;
        findings.push({
          id: `todos:${file.relativePath}:${index + 1}`,
          category: 'todos',
          title: 'Stale TODO',
          path: file.relativePath,
          line: index + 1,
          confidence: 'high',
          evidence: [
            { type: 'marker', message },
            {
              type: 'git',
              message: `introduced ${new Date(introducedAt).toISOString().slice(0, 10)}`,
            },
            { type: 'age', message: `${ageDays} days old (threshold: ${threshold})` },
          ],
          recommendation: 'Resolve, rewrite, or create a tracked issue for this marker.',
          metadata: {
            marker: match[1],
            ageDays,
            introducedAt: new Date(introducedAt).toISOString(),
          },
        });
      }
    }
    return findings;
  },
};
