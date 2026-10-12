# Task 4 requirement ledger

Contract: issue 4 was successfully loaded in full at session start with
`gh issue view 4 --json number,title,body,labels,comments`. Parent
hanhnghh/sandcastle#1 product decisions and delivery acceptance supply frozen
inputs, project ownership, loopback security and browser accessibility contracts.
Baseline `39b8b45feac4b9f4d91401ce663c8436063d4307`; branch
`sandcastle/issue-4` began clean in the original implementation session.
The continuation on 2026-10-12 found the listed task-scoped changes and retained
ledger already present; all accumulated progress was preserved. The full issue
contract and required host guidance were reloaded successfully. The issue remains open.

All evidence is **new**, on Linux, Node v24.21.0, npm 11.19.0,
repository package-lock.json, Vitest 3.2.4, TypeScript native preview
7.0.0-dev.20260317.1, Playwright 1.63.0 and installed Chromium. Dependencies
were already installed; no bootstrap/install was needed. No prior receipts
were reused. Graph exploration/query/node/impact/affected identified operator,
CLI, init and runtime callers. New environment symbols missed the index;
direct reads established exact contracts. Root Markdown operator docs are
English-only and outside the docs website build inputs.

## Commands and exact tests

Command aliases expand to these executable strings:

- **F**: `npm test -- src/OperatorEnvironment.test.ts src/Operator.test.ts src/OperatorCli.test.ts src/OperatorPrompts.test.ts src/InitService.test.ts src/InitService.agents.test.ts src/InitService.packageManager.test.ts src/InitService.sandboxProviders.test.ts src/ReadinessWorkflow.test.ts src/run.test.ts --run`
- **C**: `npm test -- src/OperatorCli.test.ts --run` (after B finishes; CLI fixtures launch built artifacts)
- **W**: `node --test scripts/operator-environment.browser.test.mjs scripts/operator.browser.test.mjs`
- **T**: `npm run typecheck`
- **B**: `npm run build` (includes declaration generation, copied templates and public Effect-free type validator)
- **A**: documented-artifact validator, exact command below
- **D**: `git diff --check`, scoped diff/status inspection and changed-file `npx prettier --check`
- **I**: `bash .sandcastle/scripts/verify-affected.sh <batch-base-sha>` (integration owner; typecheck, full npm test, build, Agent Map browser gate)

Exact test aliases (E tests are under the `operator Docker environment` suite):

- **E1**: environment selection persists and isolates projects
- **E2**: invalid environment settings preserve configuration
- **E3**: build streams before completion and preserves the usable image on failure and cancellation
- **E4**: preflight reports daemon image UID tools and declared authentication without credentials: 'ready'; same prefix with 'missing tool', 'UID mismatch', 'daemon unavailable', 'image unavailable'
- **E5**: build logs redact declared credentials across output chunks
- **E6**: cancellation settles even when the build process ignores termination
- **E7**: simultaneous environment requests admit only one active job
- **E8**: preflight fails when declared authentication is missing
- **E9**: a build cannot report cancellation after image promotion starts
- **E10**: preflight cancellation reports a terminal cancelled result
- **E11**: environment HTTP protects mutations and isolates project job IDs
- **E12**: environment storage fails closed on corrupt documents and authentication symlinks
- **E13**: invalid project preflight declarations produce a truthful failed job
- **E14**: preflight checks Android project tools without running project bootstrap
- **E18**: build uses the saved project's Dockerfile and literal argument vector
- **E17**: preflight reports missing declared Codex authentication without credentials
- **E16**: preflight does not report an auth directory as a credential file
- **E15**: trusted SDK preflight policy observes project tools UID and auth file presence
- **C1**: operator CLI serves only its explicit project and hands its frozen runtime to the fixed workflow
- **R1**: runtime freezes revision, prompt templates and image identity while the next run uses saved role settings
- **G1**: parallel-planner-with-review Codex consumers use the shared runtime and preserve the selected model; codex-afk Codex consumers use the shared runtime and preserve the selected model
- **G2**: scaffolds the codex-afk profile runtime with isolated OAuth and CodeGraph
- **G3**: runs Codex AFK with sandbox-native npm bootstrap and read-only feedback
- **G5**: reviewed Podman Codex workflow preserves its native image resolution
- **H1**: operator HTTP requires a local session and exact origin/host and cannot partially save malformed requests
- **W3**: keyboard operation and actionable invalid-input feedback preserve durable settings
- **W4**: saving during a run leaves its displayed settings frozen and opens recorded workflow logs
- **G4**: runs Android Codex AFK with an Android SDK image and isolated Gradle cache
- **W1**: environment forms persist selection and stream cancellable jobs
- **W2**: environment saves isolate browser projects

## Requirement matrix

Each command/test alias above identifies exact executable evidence. All branch
rows require new final-source evidence; prior focused RED/GREEN executions are
retained in the notes below. No branch pass is inferred from a full-suite status.

| ID  | source                   | requirement                                                                                               | public seam                      | exact test                    | command | evidence (new/reused) | receipt/applicability                             | owner             | status              |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------- | ------- | --------------------- | ------------------------------------------------- | ----------------- | ------------------- |
| A1a | #4 AC1                   | show configured image                                                                                     | HTTP/browser                     | E1, W1                        | F, C, W | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A1b | #4 AC1                   | show local availability and installed images, including unavailable image                                 | Docker executable/HTTP           | E3, E4                        | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A1c | #4 AC1                   | select installed image                                                                                    | browser/HTTP                     | W1                            | F, C, W | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A1d | #4 AC1                   | select custom image name                                                                                  | browser/HTTP/CLI                 | E1, W1, C1                    | F, C, W | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A1e | #4 AC1                   | common SDK persistence and web restart persistence                                                        | SDK/HTTP/browser                 | E1, E12, W1                   | F, C, W | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2a | #4 AC2                   | explicit asynchronous build job                                                                           | HTTP/browser                     | E3, W1                        | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2h | #4 What to build; AC3    | build saved declared Dockerfile with literal arguments in the selected project                            | HTTP/Docker executable           | E18                           | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2b | #4 AC2                   | explicit asynchronous preflight job                                                                       | HTTP/browser                     | E4, W1                        | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2c | #4 AC2                   | live streamed logs before completion; reconnect/reload                                                    | SSE/browser                      | E3, W1                        | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2d | #4 AC2/6                 | truthful completed build/preflight results                                                                | HTTP/SSE/container               | E3, E4                        | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2e | #4 AC2/6                 | truthful failed build/preflight results; preserve previous usable config/image                            | HTTP/SSE/container               | E2, E3, E4, E13               | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2f | #4 AC2/6                 | cancelled build/preflight results and promotion commit boundary                                           | HTTP/SSE/browser                 | E3, E6, E9, E10, W1           | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A2g | #4 AC2                   | single active job, including simultaneous requests                                                        | HTTP                             | E7                            | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3a | #4 AC3                   | daemon prerequisite including failure                                                                     | HTTP/container                   | E4                            | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3b | #4 AC3                   | image prerequisite including missing image                                                                | HTTP/container                   | E4                            | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3c | #4 AC3                   | actual image UID including mismatch                                                                       | HTTP/container                   | E4, E15                       | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3d | #4 AC3                   | required Node/npm, Android and project tools; missing tool                                                | HTTP/container/SDK               | E4, E14, E15                  | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3e | #4 AC3; #1 security      | declared auth presence/missing status and instructions without credential values                          | HTTP/browser/container           | E4, E8, E15, E16, E17, W1     | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3f | #4 AC3; #1 security      | build stream redaction across chunks; log text rendered as data                                           | SSE/browser                      | E5, W1                        | F, W    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3g | #4 AC3                   | reject invalid Dockerfile paths: absolute, traversal, escaped symlink, directory, missing file, backslash | HTTP/SDK                         | E2                            | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A3h | #4 AC3                   | reject invalid image/argument syntax, executable text, auth/command fields, unsupported schema            | HTTP/SDK                         | E2, E11, E12                  | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A4a | #4 AC4                   | fake container boundary uses selected image and records resolved SHA-256 identity                         | CLI/container/runtime/HTTP       | C1                            | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A4b | #4 AC4; #1 frozen inputs | image edit during execution keeps active identity and applies next run                                    | CLI/HTTP/runtime                 | C1, R1                        | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A4c | #4 AC4                   | image selection/role/prompt changes do not rebuild; explicit environment build only                       | Docker executable/CLI            | E3, C1                        | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A4d | #4 AC4; #1 delivery      | generated Docker workflow reads common selection and frozen identity; Podman/provider compatibility       | generated consumer               | G1, G5                        | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A5a | #4 AC5                   | preserve branch-isolated dependency caches                                                                | generated workflow               | G2, G3, G4                    | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A5b | #4 AC5                   | preserve project bootstrap and gates; preflight does not execute arbitrary bootstrap text                 | generated workflow/HTTP          | G1, G3, G4, E14               | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A5c | #4 AC5                   | preserve authentication mounts and project-owned sandbox options                                          | generated workflow/CLI/container | G2, G3, C1                    | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A5d | #4 AC5                   | Save triggers no Docker cleanup or publishing                                                             | HTTP/Docker executable           | E3, C1                        | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A6a | #4 AC6; #1 security      | HTTP session/origin protection, reject command/project overrides and isolate job IDs                      | HTTP                             | E11, H1                       | F       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A6b | #4 AC6; #1 delivery      | browser forms, errors, persistence, keyboard controls, readable jobs/log navigation, project isolation    | browser                          | W1, W2, W3, W4                | W       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A6c | #4 AC6                   | CLI boundary regression for selection and next run                                                        | CLI/HTTP/container               | C1                            | F, C    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| A6d | #4 AC6; AGENTS.md        | README/guide agree with public APIs; nonduplicate package-named minor changeset                           | user-facing artifacts/built SDK  | documented-artifact validator | A, B, D | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| B1  | feedback loops           | affected type checks                                                                                      | SDK types                        | compiler                      | T       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| B2  | feedback loops           | affected build and consumer contracts                                                                     | built SDK/CLI/templates          | build/public type validator   | B, F    | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| B3  | completion gate          | scoped diff, formatting, no secrets/local/generated churn                                                 | git/artifacts                    | scoped inspection             | D       | new                   | final receipts below; unchanged Linux source      | implementer       | pass                |
| I1  | feedback loops           | authoritative cumulative gate on exact integrated source                                                  | integrated candidate             | full gate                     | I       | new (future)          | immutable batch baseline; final integrated source | integration owner | pending-integration |

## Slice observations and diagnosis

E1 failed with the expected missing HTTP 404 at 17:40, then passed after the
shared configuration route/API. E2 added a missing malformed-image rejection
(200 instead of 400, 17:41); validation passed after restricting reference
syntax. E3 failed at missing job route 405 (17:42), then passed live SSE,
completed/failed/cancelled outcomes and staging-tag preservation (17:43).
E4 failed at unsupported preflight kind 400, then passed daemon/image/UID/tool
and auth summaries (17:44). C1 first exposed a fixture module-format problem:
its fake Node executable used require inside a module project; after fixing
that setup it failed for the intended default-image versus selected-image
behavior at 17:45. Selected CLI identity and next-run freeze passed at 17:46.
Browser W1 first failed on the absent Docker image control, then passed the
new forms/jobs at 17:48. Its restart assertion was corrected to wait for the
public loaded-config status, rather than reading before asynchronous loading.

E5 failed because a declared credential split across chunks leaked (17:49),
then passed line-stream redaction using the common environment resolver.
E6 exposed a termination-resistant child that never settled (17:50); the
owned fake process was identified through /proc and stopped before retry.
Bounded TERM/KILL escalation fixed the original reproduction. E7 admitted
both simultaneous jobs (202/202, 17:50), then passed 202/409 after atomic
admission. E8 missed an empty declared auth value and reported completed
(17:51); explicit declared-key checks now report failed/missing.
Cancellation error text incorrectly said failed (17:52), then passed truthful
cancelled diagnostics. E9 accepted cancellation during promotion (202 rather
than 409, 17:53); the promotion state/commit boundary fixed it. The polling
harness now recognizes explicit terminal states, including the new nonterminal
promotion status. These are product repairs, not acceptance relaxations.

Generated consumers first lacked common image selection (17:54); both Codex
scaffolds passed after wiring native Docker starts to saved environment settings
and preserving Podman's existing image path. Browser reload during an active
job lost logs (17:57); retained job observation/SSE replay fixed it. E12 silently
used defaults for a dangling config symlink (17:56), then passed fail-closed
storage. E13 exposed JSON null causing an unhandled defect and stuck running
status (18:00); profile validation and terminal failure handling now pass
(18:01). Android and custom SDK policy checks passed at 18:02. The Docker fake
was strengthened to model successful tag promotion and preserve its previous
identity across failed/cancelled builds (18:05), rather than always returning
one identity. All prior slice receipts are observations, not reused final gates.

There are no unresolved product/environment failures and no full-gate pass is
claimed. The full/cumulative gate is integration-owned. Final checks below bind
to the unchanged production source and listed harnesses; later ledger-only
receipt edits do not change their applicability.

E16 reported completed for a credential path that was a directory (18:12).
The prerequisite now requires an actual file and the original focused test
passed after correction. This invalidates the earlier build; final T/B/F/W
checks must rerun on the corrected source.

The first concurrent final F/W/T/D run hit the 5-second per-test limit in the
combined preflight scenario test; W/T/D passed. The harness now gives each
explicit prerequisite scenario its own test with the same assertions and
timeout, including separate missing-Codex authentication evidence. No product
expectation or timeout was relaxed. Final affected tests rerun after this
harness change.

A subsequent native fixture run still exceeded the default 5-second budget;
collection itself took 55.72 seconds under host scheduling load. The redaction
fixture also observed only its first chunk: its 20ms completion interval could
exit before the second write's 30ms timer when a fixed 150ms host delay finished
before the child started. This is established harness timing, not a relaxed
credential expectation. The fixture now waits at the public job seam for the
complete redacted output before allowing completion. Native HTTP/container
contracts use a bounded 30-second integration test budget (existing generated
workflow contracts use 90 seconds); terminal polling remains bounded at 20
seconds. Assertions and product Docker-operation limits are unchanged.

## Final receipts

2026-10-12 continuation receipts, all on the environment recorded above.
Tested source manifest SHA-256: `ca630024c35c5523d08f8d74cd1bfb5a888a1033135c5555f0035e66b74a1ab1`.
The ordered manifest consists of these files (UTF-8 filename, NUL, contents, NUL):

- `README.md`
- `docs/operator.md`
- `src/InitService.test.ts`
- `src/InitService.ts`
- `src/OperatorCli.test.ts`
- `src/OperatorCli.ts`
- `src/OperatorServer.ts`
- `src/index.ts`
- `src/operatorAssets.ts`
- `.changeset/operator-docker-environment.md`
- `scripts/operator-environment.browser.test.mjs`
- `src/OperatorEnvironment.test.ts`
- `src/OperatorEnvironment.ts`

- **F**, started 15:10:36 UTC, duration 209.06s: nine files passed,
  404 tests passed. The command exited 1 solely because C1 launched while the
  concurrent build was cleaning/replacing dist. This is a recorded failed
  command, not a claimed passing aggregate. All other individual focused-file
  receipts are passing and retain their original results, including all 22
  environment tests and all 16 generated ReadinessWorkflow tests.
- **C**, started 15:11:28 UTC after B finished, duration 6.45s: exit 0,
  one file/one test passed. No source changed between F and C. The built CLI
  regression now proves selected container identity, auth mounts, active freeze,
  next-run image selection and no Save-triggered build/publishing/cleanup.
  F's passing file receipts plus C cover all 405 tests in the declared affected
  set; the failed CLI receipt is superseded only by C.
- **T**, started approximately 15:10:37 UTC: exit 0.
- **B**, started approximately 15:10:38 UTC: exit 0, ESM and declarations
  generated, templates copied, public Effect-free declaration check passed.
  Existing unused-import bundler warnings are visible; no build failure.
- **W**, started approximately 15:11:29 UTC, duration 10.73s: exit 0,
  all nine browser tests passed (two new environment tests and seven operator
  regressions), using built artifacts after B.
- **A**, approximately 15:11:55 UTC: exit 0. The guide's environment JSON
  example saved/loaded through built SDK in an isolated real filesystem
  fixture; README link, package-named minor changeset and exact nonduplication
  validated. All existing changesets were also inspected for semantic overlap.
- **D**, 15:11–15:15 UTC: diff whitespace and changed-file Prettier checks
  passed. All 14 scoped files inspected, including new files absent from the
  tracked diff. No unrelated changes, credentials, runtime state or generated
  distribution files are staged. Ledger formatting is checked again after
  these receipt edits.

Readiness/recovery graph callers outside the selected set consume unchanged
readiness APIs; generated workflow execution and every init provider/profile
contract cover the actual changed init path. No readiness/merge policy is edited.
No authoritative/full-gate receipt is asserted or reused. **I** remains
`pending-integration`, owned by the integration owner on the exact final
integrated candidate with its immutable batch baseline.

Exact **A** command:

````bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnvironmentConfig, saveEnvironmentConfig } from './dist/index.js';
const guide = await readFile('docs/operator.md', 'utf8');
const readme = await readFile('README.md', 'utf8');
assert.ok(readme.includes('(docs/operator.md)'));
const document = JSON.parse(guide.split('## Docker environment and jobs')[1].match(/```json\n([\s\S]*?)\n```/)[1]);
const cwd = await mkdtemp(join(tmpdir(), 'operator-docs-'));
try {
  await mkdir(join(cwd, '.sandcastle'));
  await writeFile(join(cwd, '.sandcastle/Dockerfile'), 'FROM fixture');
  await saveEnvironmentConfig({ cwd, config: document });
  assert.deepEqual(await loadEnvironmentConfig({ cwd }), document);
} finally { await rm(cwd, { recursive: true, force: true }); }
const changeset = await readFile('.changeset/operator-docker-environment.md', 'utf8');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.ok(changeset.includes('"' + pkg.name + '": minor'));
for (const file of await readdir('.changeset')) {
  if (!file.endsWith('.md') || file === 'operator-docker-environment.md') continue;
  assert.notEqual(await readFile(join('.changeset', file), 'utf8'), changeset);
}
console.log('Documented environment example round-trips through built SDK; README link and minor changeset validated.');
NODE
````
