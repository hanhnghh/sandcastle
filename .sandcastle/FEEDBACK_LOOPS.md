# Feedback Loops

This file is generated from `.sandcastle/project.json`. Commands are executed
inside the sandbox from the repository root. Update the project profile and
regenerate these artifacts when the package layout or build system changes.

## Bootstrap

- Command: `npm ci`
- Cache: `.sandcastle/cache/npm` → `/home/agent/.npm`

## Root Package

- Working directory: `.`
- Focused test: `npm test -- <affected-test-files> --run`

Authoritative gates:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `node --test scripts/agent-map.browser.test.mjs` (after build)

Run package gates in Linux, with writable ignored runtime log directories.
The initial host/macOS full suite has Podman Machine and physical-path fixture
failures; these are not permission to skip Linux tests or new regressions.
For operator web changes, add and run focused browser/HTTP tests for the issue's
criteria in addition to the existing Agent Map browser suite.

## Cumulative Merge Gate

Run `.sandcastle/scripts/verify-affected.sh <batch-base-sha>`. It validates
the complete diff from the immutable batch base before tasks may be closed.
