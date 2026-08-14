# Changelog

## 0.2.0

- Added branch-aware `scan --since <git-ref>` with previous-content analysis and causal evidence.
- Added a shared reference index for files, packages, environment variables, runtime signals, and
  framework detection.
- Added cross-surface findings for dependencies imported only by potentially dead files.
- Replaced template caveats with supporting, contradicting, and uncertain evidence groups.
- Redesigned terminal output around readable finding stories and branch evidence.
- Added false-positive fixtures, self-scan, a branch-removal demo, and a 1,001-file benchmark.
- Removed stale TODO scanning to keep the product focused on removable repository artifacts.

## 0.1.0

- Initial evidence-first scanner for JS/TS, Python, dependencies, environment/config drift, npm
  scripts, Docker stages, and duplicate artifacts.
