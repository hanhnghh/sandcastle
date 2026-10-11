# Sandcastle develops Sandcastle

The active backlog is https://github.com/hanhnghh/sandcastle/issues/1.
Run `npm run sandcastle` from a clean, committed integration branch.
The runner uses the locally built SDK, the guarded reviewed workflow, and
the explicit fork/scope from `readiness.json`. It does not push source or publish
packages. Parent PRD acceptance remains manual.

Roles use `gpt-6.1-sol`: planner/implementer low, reviewer/merger/readiness high.
Limits are ten batches. The project-local `codex-home` holds ChatGPT subscription
auth/session storage, is ignored by Git and is never copied from other projects.
Complete `CODEX_HOME="$PWD/.sandcastle/codex-home" codex login` before starting.
Host GitHub keyring auth is resolved in memory, never logged or saved into .env.

The image is `sandcastle-selfhost:local`, UID/GID aligned with the host. Build it
using `node dist/main.js docker build-image --image-name sandcastle-selfhost:local`.
For this initial run, an existing compatible tooling image was reused by tagging
`seo-app-sandcastle:latest`; it contains no app sources or credentials. Its image
ID is recorded in the run launch evidence. Rebuild from this Dockerfile when tools
change. Playwright Chromium is available for real operator UI regression checks.

Linux dependencies are cached per branch separately from host node_modules;
download cache and CodeGraph cache are separately mounted. One ready hook runs
auth checks, lock-aware npm ci, local SDK build and CodeGraph sync sequentially.
The local runner lock prevents two controllers from starting for this checkout.
This adapter does not claim crash-resume or adoption of surviving containers.

Baseline note: the unchanged `SandboxLifecycle.test.ts` commit-collection
fixture assumes a real git child process cannot finish inside a 1 ms budget.
One Linux full-suite run failed that timing assertion while another passed it.
Do not skip it or treat a retry as proof that this fixture is deterministic.
Any new or persistent failure still blocks the cumulative merge gate.

Readiness is **apply**, bounded by `readiness-policy.json` for approved #2–#7
and the pinned parent PRD #1. Before assessment the host independently runs the
Linux package/browser gate at the integration HEAD, with no model. The read-only
readiness agent then proposes evidence/gates/status; the host verifies the
contract hashes, complete comments/dependency identities, completed dependency
branches and their ancestry, gate execution and tracker freshness/readback.
Publication replaces only a managed summary prefix and readiness labels; original
ACs/dependencies, holds and parent PRD remain unchanged. #3/#4/#5 unlock after #2;
#6 after all three, #7 after #6. Unknown/edited contracts need maintainer approval.
Failures stop the next planner; a mere file/hash or an agent's claim is not proof.

Reviewer input contains an inventory/stat/commit summary at an immutable task
baseline. Review still covers every changed file and AC, reading full patches in
bounded chunks or validating large opaque artifacts through producers/consumers.
Codex input is checked after expansion before invocation; it is never truncated.

Read-only Agent Map: `node dist/main.js dashboard --port 0`.
