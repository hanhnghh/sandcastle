# Issue 6 final requirement ledger

Branch: `sandcastle/issue-6`; initial clean baseline `28652a5`. Issue 6 was successfully loaded in full with `gh issue view 6 --json number,title,body,labels,comments` on 2026-10-12. Parent issue 1 supplied update identity/provenance, package-versus-migration, local security and public compatibility requirements. No unrelated branch progress was changed. Publication, registry accounts, source pushes and issue closure remain outside this implementation.

All command aliases below are exact executable commands from the repository root. T references are exact test names listed below (not representative substitutions).

- U: `node --test scripts/operator-updates.browser.test.mjs`
- A: `node --test --test-name-pattern='uniquely' scripts/operator-updates.browser.test.mjs`
- Q: `node --test --test-name-pattern='real registry root|asynchronous' scripts/operator-updates.browser.test.mjs`
- C: `npm test -- src/cli.test.ts src/OperatorCli.test.ts --run`
- R: `npm test -- src/Operator.test.ts src/OperatorPrompts.test.ts src/OperatorEnvironment.test.ts src/OperatorWorkflow.test.ts src/OperatorCli.test.ts src/OperatorGenerated.test.ts src/cli.test.ts src/AgentMap.test.ts --run`
- E: `node --test scripts/operator.browser.test.mjs scripts/operator-environment.browser.test.mjs scripts/operator-workflow.browser.test.mjs scripts/operator-prompts.package.test.mjs`
- B: `npm run typecheck` followed by `npm run build` (including its public declaration validator)
- D: `git diff --check` plus scoped diff/status inspection
- M: `bash .sandcastle/scripts/verify-affected.sh <batch-base-sha>`; invokes authoritative `npm run typecheck`, `npm test`, `npm run build`, `node --test scripts/agent-map.browser.test.mjs` on the exact integrated source. The integration owner supplies the immutable batch base.

| ID  | source                          | requirement                                                                                        | public seam                          | exact test                              | command        | evidence (new/reused) | receipt/applicability                                                             | owner             | status              |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------- | -------------- | --------------------- | --------------------------------------------------------------------------------- | ----------------- | ------------------- |
| U1  | AC1                             | Installed runtime, source and integrity                                                            | CLI/Updates                          | T4, T8                                  | Q              | new                   | Q exact installed-line/source assertions                                          | implementer       | pass                |
| U2  | AC1                             | Available version, changelog and explicit action                                                   | CLI/Updates                          | T1, T3, T8                              | U              | new                   | U13 plus Q                                                                        | implementer       | pass                |
| U3  | AC1                             | Shared CLI plan/execution contract and dry-run                                                     | CLI                                  | T1, T4                                  | U              | new                   | U13; dry-run creates no manifest                                                  | implementer       | pass                |
| U4  | AC1/4                           | Selected version, tags and version constraints                                                     | CLI/browser                          | T1, T3, T4, T5                          | U              | new                   | U13; ~0.13.1, exact version, latest and beta                                      | implementer       | pass                |
| I1  | AC2                             | Explicit fork identity/registry/channel; no upstream fallback                                      | CLI/HTTP                             | T1, T5, T12                             | U              | new                   | U13; missing/auth/identity failures                                               | implementer       | pass                |
| I2  | AC2                             | Local archive is pinned; no npm latest or version selection                                        | CLI/browser artifact                 | T2                                      | U              | new                   | U13; archive identity, integrity and version selection rejection                  | implementer       | pass                |
| P1  | AC3                             | Unique packed fork candidate with CLI/UI/defaults/license/source/integrity                         | packed package/installed CLI/Updates | T2, T3, T8                              | U, E           | new/reused            | U13, A1 and E12; independently hashed archive/source commit; same built UI assets | implementer       | pass                |
| P2  | AC3                             | Isolated automation manifest installation                                                          | CLI                                  | T2                                      | U              | new                   | U13; real npm installs candidate archive                                          | implementer       | pass                |
| P3  | AC3                             | Declared root dependency installation                                                              | CLI                                  | T4, T9, T12                             | U              | new                   | U13; declaration required, unrelated dependencies preserved                       | implementer       | pass                |
| V1  | AC4                             | Intended manifest and lock updated together                                                        | CLI/public consumer artifacts        | T4                                      | U              | new                   | U13 plus Q exact lock/version/source/integrity                                    | implementer       | pass                |
| V2  | AC4/6                           | Installed exports and actual version verified before promotion                                     | installed SDK/CLI                    | T2, T7                                  | U              | new                   | U13; bad exported version rejected                                                | implementer       | pass                |
| V3  | AC4/6                           | Rollback evidence and restoration retained after successful or failed attempts                     | CLI/browser/returned record artifact | T4, T6, T8                              | U              | new                   | U13; previous bytes/runtime restored, failure retains prior rollback              | implementer       | pass                |
| F1  | AC4                             | Missing authentication truthful, credentials excluded, original state retained                     | CLI                                  | T5                                      | U              | new                   | U13; loopback 401                                                                 | implementer       | pass                |
| F2  | AC4/6                           | Failed metadata fetch / missing configured fork                                                    | CLI                                  | T5                                      | U              | new                   | U13; loopback 404; no fallback                                                    | implementer       | pass                |
| F3  | AC4/6                           | Failed archive download truthful and recoverable                                                   | CLI/browser                          | T6, T8                                  | U              | new                   | U13; loopback 503 with distinct packing/consumer caches                           | implementer       | pass                |
| F4  | AC4/6                           | Failed npm dependency install truthful and recoverable                                             | CLI                                  | T6                                      | U              | new                   | U13; missing dependency 404; original install preserved                           | implementer       | pass                |
| F5  | AC4/6                           | Failed installed-version/exports verification preserves consumer                                   | CLI/installed SDK                    | T7                                      | U              | new                   | U13; independently wrong exported runtime version; lifecycle script not executed  | implementer       | pass                |
| G1  | AC5                             | Reject active project runs, recovery ownership and second-operator/CLI replacement                 | CLI/HTTP/browser                     | T8, T10, T11                            | U              | new                   | U13; shared execution claim and real recovery/map boundaries                      | implementer       | pass                |
| G2  | AC5                             | Browser cannot override active-run guard                                                           | HTTP/browser                         | T8                                      | U              | new                   | U13; force/cwd request rejected                                                   | implementer       | pass                |
| G3  | AC5                             | Async UI progress/failure without blocking run observation                                         | HTTP/browser                         | T8                                      | U              | new                   | U13; phase progress, failed result, heartbeat timeout boundary                    | implementer       | pass                |
| S1  | parent product decisions        | Session/origin protection, selected-project writes and reviewed revision                           | HTTP/browser                         | T8, T12                                 | U              | new                   | U13; unauthorized/foreign/override/mutated-plan requests rejected                 | implementer       | pass                |
| S2  | parent provenance/persistence   | Preserve concurrent host edits; private update evidence ignored                                    | SDK/public manifest/Git artifact     | T13                                     | U              | new                   | U13; edits remain durable and Git check-ignore succeeds                           | implementer       | pass                |
| C1  | parent compatibility            | Replace legacy upstream archives explicitly; customization and public operator contracts preserved | CLI/HTTP/SDK/browser                 | T4, T9; existing operator tests         | U, R, E, C     | new/reused            | new U13/C30; applicable R98/E12; no workflow/prompt migration                     | implementer       | pass                |
| D1  | AC7                             | Release and consumer procedures, README and minor changeset                                        | documented CLI/script/consumer       | T1, T2, T4; shows help with --help flag | U, R           | new                   | U13/C30 exercise documented commands; scoped documentation/changeset inspection   | implementer       | pass                |
| L1  | completion gate                 | Localized documentation agrees when applicable                                                     | documentation inventory              | not-applicable                          | not-applicable | new                   | No localized operator/README variants are supported in this repository            | implementer       | not-applicable      |
| B1  | feedback branch checks          | Affected public types and package build                                                            | root npm package                     | typecheck/build/public type validator   | B              | new                   | B final executable source; public declarations Effect-free                        | implementer       | pass                |
| B2  | completion gate                 | Task-scoped clean diff, no generated runtime state/secrets                                         | Git diff/status                      | diff inspection                         | D              | new                   | D final scoped diff and clean whitespace                                          | implementer       | pass                |
| M1  | feedback integration policy     | Authoritative cumulative gate on exact integrated candidate                                        | integration script                   | full integration gate                   | M              | new                   | Future integrated source; not a branch pass or waiver                             | integration owner | pending-integration |
| M2  | AC6 / integration applicability | Requalify focused CLI/browser evidence if integration changes tested contracts                     | CLI/HTTP/browser                     | T1–T13 and existing browser contracts   | U, E           | new                   | Integration owner determines applicability after integration                      | integration owner | pending-integration |

## Exact tests

- T1: `CLI dry-run resolves only configured fork and selected version without installing`
- T2: `uniquely versioned candidate packs required runtime assets and installs into an isolated consumer with verified version`
- T3: `Updates browser displays fork plan and changelog with keyboard selected-version preview`
- T4: `real registry root dependency installs selected fork, updates manifest and lock together and rolls back while preserving customization`
- T5: `configured fork channel, missing fork and missing authentication never fall back upstream or change consumer files`
- T6: `failed download and npm dependency installation preserve installed runtime and recoverable records`
- T7: `installed exports/version verification rejects a bad archive without running lifecycle scripts or replacing the consumer`
- T8: `browser asynchronous install and rollback report progress; heartbeat stays responsive; active runs and request overrides cannot bypass guards`
- T9: `consumer can plan and replace a declared legacy upstream archive with the explicit fork`
- T10: `CLI rejects active recovery-owned project runs even without an Agent Map recording`
- T11: `project run ownership protects against a second operator and CLI without relying on adapter recordings`
- T12: `reviewed browser revision rejects changed manifests and candidate identity; selected project never writes to another consumer`
- T13: `staged installation preserves host edits made after preview and keeps private evidence out of consumer Git status`

## Receipts and applicability

Environment: Debian GNU/Linux 12, Node v24.21.0, npm 11.19.0, repository package-lock (unchanged), installed Vitest and Playwright Chromium. Existing Linux dependencies were present; no bootstrap install was needed. External boundaries: loopback fake npm metadata/tarball registry, real npm temporary consumers, fake provider/tracker/Docker boundaries for existing operator regressions. No registry publication/account operations or tracker mutations ran.

U13: new evidence, final 13/13 tests passed on the final executable source, duration 52.750s; `/tmp/issue6-updates-final.log` (original output timestamp/hash below). All CLI plans/install/rollback results are parsed as complete stdout JSON. This final run includes the independent archive SHA-512/Git HEAD/source assertions and the exact installed archive/source/integrity line assertions. Earlier A1/Q focused refinements passed (1/1 and 2/2); their original observations remain recorded below, but final U13 supersedes them for branch qualification.

R98: passing individual focused receipts, 98/98 tests across eight affected files passed, started 2026-10-12 17:52:49 UTC, duration 13.72s; `/tmp/issue6-regressions-final.log`.

E12: new evidence, 12/12 browser/package tests passed, started alongside R98, duration 10.152s; `/tmp/issue6-existing-browser-final.log`. Tested the final built public operator/default assets.

C30: new evidence, 30/30 CLI/operator-child tests passed on final executable source, started 2026-10-12 18:06:03 UTC, duration 6.28s; `/tmp/issue6-cli-final.log`. This requalifies existing CLI paths after the scoped JSON cleanup change.

B: new evidence, final production source passed typecheck and build immediately before the final U13 run; `/tmp/issue6-typecheck-final.log` and `/tmp/issue6-build.log`, including the passing public declaration validator. No production source changed after B/U13/C30.

R98/E12 applicability: their original timestamps and results are retained. The sole subsequent production change is the `src/main.ts` condition which omits terminal cleanup for the new `updates` command. R98's 68 non-CLI SDK/HTTP/generated tests and E12's SDK-served browser/package-default contracts never execute this main-entry condition; their producer/consumer/harness contracts and source remain unchanged. The 30 CLI paths were re-run in C30. R98/E12 are focused receipts, not reusable full-gate proof. The old main-entry source was unchanged from baseline `28652a5`; its SHA-256 is `6fea444247d156ff79c36d058896b2f773a9d5f79541a5359c5a6fdcdb9db860`. Final main source is listed below. Local test assertion enhancements are all requalified by final U13.

Additional reusable focused receipt: `src/ReadinessWorkflow.test.ts` passed all 24 generated workflow tests in the earlier aggregate run starting 2026-10-12 17:46:17 UTC (file duration 181.320s), `/tmp/issue6-regressions.log`. That aggregate exited red due to four operator/CLI tests, all repaired and independently re-run green in R98. This is a passing individual focused-file receipt, **not** a passing aggregate/full-gate receipt. Generated workflow/runtime/readiness producer paths and their executed contracts did not change after it; later edits affect runtime installation and HTTP execution cleanup, which these generated direct-SDK fixtures do not call. No full-gate proof is claimed or reused.

The receipt file timestamps/hashes and final tested source hashes below identify the retained local observations. Logs are local evidence, not a trusted full-gate proof mechanism. Only M1/M2 are pending; every branch-owned scenario is verified. The integration owner must run the authoritative gate on integrated source and owns issue closure.

## Slice and diagnosis history

- CLI missing-subcommand RED, then configured-fork plan/dry-run/constraints GREEN.
- Missing fork-pack script RED, then real npm packed archive/default/license/source/version installation GREEN.
- Missing Updates navigation RED, then keyboard preview and shared plan GREEN; root alias/latest/update/rollback additionally characterized.
- Legacy upstream plan RED, then explicit null legacy provenance GREEN.
- Recovery-owned active run RED, then Git common recovery owner/journal inspection GREEN.
- Rollback after a failed attempt RED, then separately retained successful rollback evidence GREEN.
- Second-operator/CLI exclusion without recordings RED, then shared project execution claim GREEN.
- Concurrent host manifest edits were overwritten (RED), then baseline/identity checks before promotion and private Git-ignore evidence GREEN.
- npm pack populated the global cache, masking fake tarball failures. Separate packing/consumer caches established real fetch failures; the original failure checks reran GREEN. A temporary instrumented reproduction confirmed cache use and was removed.
- One overlapping build removed dist during a running test; builds and consumer tests were sequenced thereafter. Recovery cleanup initially removed its project before finishing the owned run; explicit finally cleanup now settles that run first.
- New asynchronous lease release initially delayed terminal status, breaking three existing immediate-observation tests. Terminal observation now awaits only settled-run cleanup (active heartbeats remain responsive); all three re-run GREEN.
- Existing help test rejected any substring `run`, including required `--dry-run`. It now checks the actual removed top-level command and verifies invocation rejection; re-run GREEN. No public contract was waived.
- CodeGraph explore/query/impact/node/affected guided existing server/runtime/version callers; exact npm/HTTP/storage/config contracts and graph misses were checked with direct reads and rg.

- Final JSON-contract RED: stdout cursor escape made complete stdout invalid JSON. Scoped the non-interactive `updates` entry to omit terminal cleanup; final U13 parses all complete JSON responses and C30 confirms existing CLI commands remain compatible.

## Tested source SHA-256

- `src/OperatorUpdates.ts`: `689dafd20bba2f7f4cef803e2359965e6ea886c39e3be3a0d2a63f752e558171`
- `src/OperatorServer.ts`: `1cc0de1820d7a9f3dac831c186a439221882f294189193ccefd614bd78c357bd`
- `src/cli.ts`: `b890602fb06fd4021051fdbe6ab9bc99b86572d8069ae61665d626b3219aeab3`
- `src/main.ts`: `45b0975376db88b363a2e147cd7a0fd4d419a90a9fd75f3b7e8f9b44c553fe6a`
- `src/index.ts`: `93cf4bafec2a028f9b41adc187205e9e57e2b1d2a7d2a9b21107235bbcd31690`
- `src/operatorAssets.ts`: `d5bfc16d45609cddeed28f0a13c56be51137da2c428931c8927e90db6f67c87f`
- `src/version.ts`: `da539d09e50f6c0f80a0eaac7f8a9fe72509dc5e2ceac6ccbd6f0feb754bfc13`
- `src/cli.test.ts`: `4ce2bb20fca4b0ae2518a5d7e903507b97e4585631d03bdffbc130fd3dded095`
- `scripts/pack-fork.mjs`: `b97c7b5d573bf4277a8c4b4380b8f72ce74191745b26e43a27277b07e83c6ded`
- `scripts/operator-updates.browser.test.mjs`: `cb1f26b6418227af2cd9d5ad269e2727e290f1922f946c1f4733af319aa1cd86`
- `package-lock.json`: `0147be5b31dd2ba8c5a65fb7988e3813fd399010fed5b8cf0de58180e938ff66`

## Retained receipt SHA-256 / original timestamps

- `/tmp/issue6-updates-final.log`: `ede674aa79bca4769718c50609afeace047b18464791123dc8b80caae5920687`; last output 2026-10-12T18:05:56.333432+00:00.
- `/tmp/issue6-cli-final.log`: `ea177fe16dc18bfcd979ea110881b7667cbcbb5e91de6c4884ecc7c0f7fadf33`; last output 2026-10-12T18:06:09.416880+00:00.
- `/tmp/issue6-typecheck-final.log`: `e7c9d0c8beef624bc76156a9fdd7ca0359bdb3b4a6c3c32c0e308ea3239c65a7`; last output 2026-10-12T18:04:51.784894+00:00.
- `/tmp/issue6-build.log`: `77b877b6bfc9b0fdee00cfd4ea6d5e69c075cd8d1afd04384680ed8495247c47`; last output 2026-10-12T18:05:03.544098+00:00.
- `/tmp/issue6-artifact-evidence.log`: `270be97d06122becf04ef9235f924a7955f736bc366d66716bf810b9ecb06c0d`; last output 2026-10-12T18:01:12.676281+00:00.
- `/tmp/issue6-installed-evidence.log`: `59e9bfdbd516659ce913c81bb2ed45e2dee2520b9cbfbc9c384f5dc4e19eaef5`; last output 2026-10-12T17:55:54.551037+00:00.
- `/tmp/issue6-regressions-final.log`: `4e24ac46923734e5ee9a1d59b7ff687826b5ca25bb6239516c41b1ba5a50387a`; last output 2026-10-12T17:53:02.767645+00:00.
- `/tmp/issue6-existing-browser-final.log`: `31f9e29e21df79f478aa3a37e2a9007832283831cd76ccb3d5c4c4be68e433ce`; last output 2026-10-12T17:52:58.183359+00:00.
- `/tmp/issue6-regressions.log`: `b736e8129238d78e039357cc22361025bdf5133b78f8b237ee5ed9e558efdfa4`; last output 2026-10-12T17:49:25.657240+00:00.
