import path from 'node:path';
import type { Analyzer, SourceFile } from '../core/repository.js';
import type { Finding } from '../models/finding.js';

interface DockerStage {
  name: string;
  line: number;
}

function isDockerfile(file: SourceFile): boolean {
  const basename = path.posix.basename(file.relativePath);
  return basename === 'Dockerfile' || basename.endsWith('.Dockerfile');
}

export const dockerAnalyzer: Analyzer = {
  name: 'docker',
  async analyze(context): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const file of context.sourceFiles.filter(isDockerfile)) {
      const stages: DockerStage[] = [];
      const referencedStages = new Set<string>();
      for (const [index, line] of file.content.split(/\r?\n/).entries()) {
        const from = /^\s*FROM\s+([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?/i.exec(line);
        if (from?.[1] && stages.some((stage) => stage.name === from[1])) {
          referencedStages.add(from[1]);
        }
        if (from?.[2]) stages.push({ name: from[2], line: index + 1 });
        const copy = /\bCOPY\s+--from=(?:['"])?([A-Za-z0-9_.-]+)/i.exec(line);
        if (copy?.[1]) referencedStages.add(copy[1]);
      }

      const finalStage = stages.at(-1)?.name;
      for (const stage of stages) {
        if (stage.name === finalStage || referencedStages.has(stage.name)) continue;
        const targetPattern = new RegExp(`--target(?:=|\\s+)${stage.name}\\b`);
        if (context.sourceFiles.some((candidate) => targetPattern.test(candidate.content)))
          continue;
        findings.push({
          id: `docker:${file.relativePath}:${stage.name}`,
          category: 'docker',
          title: 'Potential unused Docker stage',
          path: file.relativePath,
          line: stage.line,
          confidence: 'high',
          evidence: [
            { type: 'stage', message: `${stage.name} is a named build stage` },
            { type: 'from', message: 'no later FROM instruction references this stage' },
            { type: 'copy', message: 'no COPY --from instruction references this stage' },
            { type: 'target', message: 'no repository command uses it as a build target' },
          ],
          whyThisMayBeWrong:
            'External build commands can select a stage with docker build --target.',
          recommendation: `Check deployment automation for --target ${stage.name} before removing this stage.`,
          metadata: { stage: stage.name },
        });
      }
    }
    return findings;
  },
};
