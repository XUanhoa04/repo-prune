import type { Analyzer } from '../core/repository.js';
import { readPackageManifests } from '../core/package-json.js';
import type { Finding } from '../models/finding.js';

const STANDARD_SCRIPTS = new Set([
  'start',
  'dev',
  'build',
  'test',
  'lint',
  'format',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'publish',
  'postpublish',
  'preinstall',
  'install',
  'postinstall',
  'prepack',
  'postpack',
  'version',
  'preversion',
  'postversion',
  'restart',
  'stop',
]);

function scriptIsCalled(scriptName: string, commands: string[]): boolean {
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const end = '(?=$|[\\s`"\';&|])';
  const patterns = [
    new RegExp(`\\bnpm\\s+(?:run(?:-script)?\\s+)?${escaped}${end}`),
    new RegExp(`\\b(?:pnpm|yarn|bun)\\s+(?:run\\s+)?${escaped}${end}`),
    new RegExp(`npm:${escaped}${end}`),
  ];
  return commands.some((command) => patterns.some((pattern) => pattern.test(command)));
}

export const npmScriptsAnalyzer: Analyzer = {
  name: 'scripts',
  async analyze(context): Promise<Finding[]> {
    const findings: Finding[] = [];
    const documentation = context.sourceFiles.filter((file) =>
      ['.md', '.mdx', '.txt', '.yaml', '.yml'].includes(file.extension),
    );

    for (const manifest of readPackageManifests(context.sourceFiles)) {
      const scripts = manifest.data.scripts ?? {};
      const commands = Object.values(scripts);
      for (const [scriptName] of Object.entries(scripts)) {
        if (STANDARD_SCRIPTS.has(scriptName)) continue;
        if (scriptName.startsWith('pre') && scripts[scriptName.slice(3)]) continue;
        if (scriptName.startsWith('post') && scripts[scriptName.slice(4)]) continue;
        if (scripts[`pre${scriptName}`] || scripts[`post${scriptName}`]) continue;
        if (
          scriptIsCalled(
            scriptName,
            commands.filter((_, index) => Object.keys(scripts)[index] !== scriptName),
          )
        ) {
          continue;
        }
        if (documentation.some((file) => scriptIsCalled(scriptName, [file.content]))) continue;

        findings.push({
          id: `scripts:${manifest.file.relativePath}:${scriptName}`,
          category: 'scripts',
          title: 'Possibly unused npm script',
          path: manifest.file.relativePath,
          confidence: 'medium',
          evidence: [
            {
              type: 'scripts',
              message: `${scriptName} is not referenced by another package script`,
            },
            { type: 'documentation', message: 'not invoked in documentation or CI configuration' },
            { type: 'lifecycle', message: 'not a standard npm lifecycle or common project script' },
          ],
          whyThisMayBeWrong:
            'Developers may invoke this script manually or from external automation.',
          recommendation: `Search external CI and team workflows before removing the ${scriptName} script.`,
          metadata: { script: scriptName, declaredIn: manifest.file.relativePath },
        });
      }
    }
    return findings;
  },
};
