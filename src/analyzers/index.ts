import type { Analyzer } from '../core/repository.js';
import { deadFilesAnalyzer } from './dead-files.js';
import { dependenciesAnalyzer } from './dependencies.js';
import { npmScriptsAnalyzer } from './npm-scripts.js';
import { envAnalyzer } from './env.js';
import { dockerAnalyzer } from './docker.js';
import { duplicatesAnalyzer } from './duplicates.js';

export const analyzers: Analyzer[] = [
  deadFilesAnalyzer,
  dependenciesAnalyzer,
  envAnalyzer,
  npmScriptsAnalyzer,
  dockerAnalyzer,
  duplicatesAnalyzer,
];
