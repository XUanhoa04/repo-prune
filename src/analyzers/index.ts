import type { Analyzer } from '../core/repository.js';
import { deadFilesAnalyzer } from './dead-files.js';
import { dependenciesAnalyzer } from './dependencies.js';
import { npmScriptsAnalyzer } from './npm-scripts.js';

export const analyzers: Analyzer[] = [deadFilesAnalyzer, dependenciesAnalyzer, npmScriptsAnalyzer];
