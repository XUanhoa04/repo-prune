# repo-prune

Find what your repository no longer needs.

```bash
npx repo-prune scan
```

```text
$ repo-prune scan

Potential dead file

src/legacy/payment_v1.ts

Confidence: HIGH

Evidence
  - no incoming static imports
  - not a package or configured entrypoint
  - not referenced by tests or documentation
  - not referenced by known configuration files

Potentially unused dependency

moment

Confidence: MEDIUM

Evidence
  - declared in package.json
  - zero static imports or requires detected
```

**repo-prune never deletes anything automatically.** Every result includes its evidence, the
reason it may be wrong, and a recommended review step.

## Why

Repositories accumulate more than dead source files. Dependencies, environment templates,
package scripts, Docker stages, copied artifacts, and forgotten TODOs all drift at different
speeds. Most existing tools inspect one of those surfaces.

repo-prune treats the repository as a system and asks:

> What looks stale across my entire repository?

The core engine is deterministic, local, and does not use AI or send source code anywhere.

## Installation

Run it without installing:

```bash
npx repo-prune scan
```

Or install it in a project:

```bash
npm install --save-dev repo-prune
npx repo-prune scan
```

repo-prune requires Node.js 20 or newer.

## Quick start

```bash
# Scan the current repository
repo-prune
repo-prune scan

# Scan another directory
repo-prune scan ./path/to/repository

# Machine-readable output
repo-prune scan --json
repo-prune scan --format json

# Focus a review
repo-prune scan --confidence high
repo-prune scan --category dependencies

# Make CI fail on high-confidence findings
repo-prune scan --fail-on high
```

To see every analyzer immediately after cloning this repository:

```bash
npm install
npm run build
npm run demo
```

## What repo-prune detects

| Category             | Signals used                                                         | Default confidence       |
| -------------------- | -------------------------------------------------------------------- | ------------------------ |
| Potential dead files | Import graph, entrypoints, tests/docs/config references, conventions | High or Medium           |
| Unused dependencies  | Node and Python declarations, imports, scripts, config               | Medium                   |
| Configuration drift  | `.env.example` declarations, code reads, JSON/YAML config keys       | High or Medium           |
| Dead npm scripts     | Script-to-script calls, docs/CI references, lifecycle names          | Medium                   |
| Docker stages        | `FROM`, `COPY --from`, final stage, repository `--target` uses       | High                     |
| Duplicate artifacts  | SHA-256 content identity and suspicious backup-style names           | High or Low, review-only |
| Stale TODOs          | `TODO`, `FIXME`, `HACK`, `XXX` plus Git blame age                    | High                     |

JavaScript and TypeScript imports are parsed with the TypeScript Compiler API. Python uses a
lightweight, dependency-free import parser that handles common absolute, relative, package, and
`src/`-layout imports. This keeps startup fast and avoids requiring a Python installation.

## Confidence levels

- **HIGH** — several strong static signals agree and no supported safety exclusion matched.
- **MEDIUM** — the evidence is useful, but runtime loading, plugins, or external invocation are
  plausible.
- **LOW** — a weak signal worth reviewing, never a deletion claim.

Confidence is not severity and never means “safe to delete.” Prefer false negatives over a risky
false positive.

## Configuration

Create a starter file:

```bash
repo-prune init
```

repo-prune reads `.repo-prune.yml` or `.repo-prune.yaml` from the scanned root:

```yaml
version: 1

ignore:
  paths:
    - migrations/**
    - fixtures/**
    - generated/**
    - vendor/**
    - dist/**
    - build/**
  dependencies:
    - webpack
    - typescript

entrypoints:
  - src/main.py
  - src/index.ts

dynamic_import_paths:
  - plugins/**
  - handlers/**

frameworks:
  auto_detect: true

thresholds:
  stale_todo_days: 180
  max_file_size_bytes: 5242880
```

The default ignored directories are `.git`, `node_modules`, `.venv`, `venv`, `dist`, `build`,
`coverage`, `.next`, `.cache`, `.pytest_cache`, `__pycache__`, `vendor`, and `target`. Repository
`.gitignore` rules are also respected. Files larger than 5 MB and detected binary files are skipped.

Use [`.repo-prune.example.yml`](.repo-prune.example.yml) as a documented baseline. The Python
distribution-to-import mapping is exported as `PYTHON_PACKAGE_IMPORT_MAP` in
`src/analyzers/dependencies.ts` and is intentionally easy to extend.

## CLI reference

```text
repo-prune [scan] [path]

--json                    Alias for --format json
--format text|json        Reporter format
--confidence high|medium|low
                          Show exactly one confidence level
--category <category>     files, dependencies, config, scripts, docker,
                          duplicates, or todos
--fail-on high|medium|low Exit 1 if a finding at or above the level exists
--stale-days <days>       Override the stale TODO threshold
```

Exit codes:

- `0`: scan succeeded and no policy threshold was violated.
- `1`: `--fail-on` policy was violated.
- `2`: invalid configuration or execution failure.

## CI

```yaml
- name: Find repository waste
  run: npx repo-prune scan --fail-on high
```

Start with reporting only, establish an ignore baseline, and enable `--fail-on` once findings are
reviewed. JSON output can be archived as a CI artifact:

```bash
npx repo-prune scan --format json > repo-prune-report.json
```

## Supported languages

- JavaScript, JSX, TypeScript, and TSX: static imports, exports, `require`, literal dynamic imports,
  environment reads, package dependencies, and entrypoints.
- Python: common import forms, relative/package resolution, environment reads, PEP 621/Poetry and
  requirements dependencies, and `pyproject.toml` CLI entrypoints.
- Generic repositories: environment templates, JSON/YAML config, Dockerfiles, duplicate files,
  suspicious artifact names, TODO age, docs, Git ignore rules, and binary/size guards.

## Architecture

```text
src/
  cli.ts                 command parsing and exit policy
  core/                  config, filesystem, repository context, scanner
  analyzers/             one evidence-producing module per category
  languages/             JS/TS and Python reference extraction/resolution
  models/                shared Finding and Evidence contracts
  reporters/             terminal and JSON presentation only
```

Every analyzer emits the same `Finding` model. Reporters only render findings; they do not contain
scan logic. Analyzers run independently against one read-only repository context.

## Known limitations

- Non-literal dynamic imports, reflection, dependency injection, plugin discovery, and external
  automation cannot always be resolved.
- TypeScript path aliases and monorepo package boundaries receive conservative heuristic treatment;
  they are not a replacement for a full compiler build.
- The Python parser intentionally does not implement the complete Python grammar. Multiline and
  computed imports can be missed.
- Dependency packages may only expose CLIs, framework plugins, loaders, or import names absent from
  the built-in mapping.
- Docker stages may be selected by build commands outside the repository.
- Git-untracked lines have no blame age and are not reported as stale TODOs.
- Duplicate content is evidence for review, never evidence that either copy is dead.

## Roadmap

- [x] JS/TS unused files and import graph
- [x] Node and Python dependency checks
- [x] Environment and configuration drift
- [x] npm scripts, Docker stages, duplicates, and stale TODOs
- [ ] Go, Java, and Rust support
- [ ] Changed-file and Git-range scanning
- [ ] Workspace-aware dependency graphs
- [ ] Dependency graph visualization
- [ ] VS Code extension and GitHub App
- [ ] Explicit, interactive cleanup workflow
- [ ] Optional AI-assisted review for ambiguous findings

The deterministic, local engine will remain the default.

## Contributing

Issues and pull requests are welcome. Keep analyzers evidence-first, deterministic, and
non-destructive. Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run demo
```

When adding a heuristic, include a positive test, a safety-exclusion test, evidence text, and a
known-limitation note where appropriate.

## License

[MIT](LICENSE)
