# Contributing to repo-prune

repo-prune is an evidence-first cleanup advisor. A new detector is valuable only when it can explain
its conclusion and its failure modes.

## Before opening a pull request

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run demo:since
npm run prune:self
```

## Heuristic checklist

Every new heuristic should include:

1. A true-positive test showing the intended finding.
2. A true-negative test protecting a live artifact.
3. A false-positive regression for a realistic framework or runtime trap.
4. An ambiguous case that lowers confidence or emits uncertainty.
5. Computed supporting, contradicting, and uncertain evidence.
6. A conservative recommendation that asks for review rather than deletion.

Prefer adding data to the shared reference index over parsing every source file again in an analyzer.
Keep analyzers independent and place cross-surface reasoning in the correlation pass.

## Product boundaries

Do not add telemetry, source uploads, automatic deletion, AI dependencies, or unrelated lint rules.
Avoid broad language/framework claims without fixtures. Synthetic benchmark results must be labeled as
fixture precision, not production accuracy.
