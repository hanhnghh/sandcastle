# Task 3 requirement ledger

Contract: GitHub task 3, successfully loaded in full at session start; parent
hanhnghh/sandcastle#1 product decisions and delivery requirements apply to prompt
ownership, frozen inputs, public compatibility and local security. Baseline:
`c4450f8dcb17ee55b952ddee71b30346eb78b34c`; branch `sandcastle/issue-3` began clean.

All receipts below are **new** executions on Linux, Node v24.21.0, npm 11.19.0,
repository package-lock.json, installed repository dependencies, Playwright
Chromium and the current source/test harness. No prior receipt was reused.
Dependencies were already present; no bootstrap/install was necessary. Graph
navigation identified runtime/server/CLI callers; new symbols missed the index,
so direct source reads established their exact contracts. There are no localized
operator documents beyond English.

## Executable evidence and exact tests

- **U**: `npm test -- src/OperatorPrompts.test.ts src/Operator.test.ts src/OperatorCli.test.ts src/PromptArgumentSubstitution.test.ts --run` — 60 tests passed, 2026-10-11 17:06:52 UTC, 4.84 seconds.
- **W**: `node --test scripts/operator.browser.test.mjs scripts/operator-prompts.package.test.mjs` — seven tests passed, 2026-10-11 17:06:53 UTC, 7.89 seconds. Isolated built package fixture updates packaged template files; browser fake Codex executable records selected prompt through the public `run()` boundary.
- **T**: `npm run typecheck` — passed, 2026-10-11 17:06 UTC.
- **B**: `npm run build` — passed, 2026-10-11 17:06 UTC, including declarations, template copying and the public Effect-free type validator.
- **A**: documented-artifact validator (`node --input-type=module`, exact command below) — passed, 2026-10-11 17:10 UTC; checks real SDK exports, README guide link, prompt HTTP/ownership contracts and package-named minor changeset.
- **D**: `git diff --check` and scoped diff/status inspection — passed, 2026-10-11 17:07 UTC. Changed-file `npx prettier --check` also passed.

Exact test names used in the matrix:

- **U1**: defaults advance while overrides retain their base and reset follows current defaults
- **U2**: invalid templates preserve prior prompt
- **U3**: selected overrides freeze at run start
- **U4**: prompt writes reject paths and symlink escapes
- **U5**: packaged default adoption preserves existing customized project files
- **U6**: template validation follows runtime placeholder syntax and rejects control-marker shell injection
- **U7**: operator HTTP requires a local session and exact origin/host and cannot partially save malformed requests
- **U8**: operator CLI serves only its explicit project and hands its frozen runtime to the fixed workflow
- **U9**: runtime freezes revision, prompt templates and image identity while the next run uses saved role settings
- **W1**: prompt editor saves with keyboard, reloads, resets and renders data
- **W2**: fake model receives selected prompt while edits apply to the next run
- **W3**: prompt overrides persist across an operator web restart and isolate projects
- **W4**: installed packaged defaults advance without overwriting project customization

## Final matrix

Command and exact-test IDs expand to the complete executable strings/names above.
Receipt applicability: U/W/T/B bind to the unchanged production source and their
listed harnesses on this branch; D additionally covers documentation/changeset.
All branch rows are owned by the implementer. I1 is the integration owner's
future gate, not a pass or waiver.

| ID  | source                            | requirement                                                      | public seam                | exact test                              | command                                                                                         | evidence (new/reused) | receipt/applicability                                                            | owner             | status              |
| --- | --------------------------------- | ---------------------------------------------------------------- | -------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------- | ----------------- | ------------------- |
| P1a | #3 AC1/6                          | each of five roles has editor and default/override status        | browser                    | W1, W3                                  | W                                                                                               | new                   | Linux/current source                                                             | implementer       | pass                |
| P1b | #3 AC1/6                          | edit/save/reload                                                 | browser/HTTP               | W1                                      | W                                                                                               | new                   | Linux/current source                                                             | implementer       | pass                |
| P1c | #3 AC1                            | persist across web restart                                       | browser/HTTP               | W3                                      | W                                                                                               | new                   | Linux/current source                                                             | implementer       | pass                |
| P1d | #3 AC1/6                          | reset to current default                                         | browser/SDK                | W1, U1, U5                              | W, U                                                                                            | new                   | Linux/current source                                                             | implementer       | pass                |
| P1e | #3 AC1/2                          | readable editor/default and changed-default diffs                | browser                    | W1                                      | W                                                                                               | new                   | diff opened by keyboard, plus/minus text                                         | implementer       | pass                |
| P2a | #3 AC2; #1 ownership              | override distinct from versioned default/base                    | SDK                        | U1, W4                                  | U, W                                                                                            | new                   | content-addressed versions, retained original base                               | implementer       | pass                |
| P2b | #3 AC2                            | untouched prompts receive current packaged defaults              | installed SDK              | W4                                      | W                                                                                               | new                   | isolated package templates updated after adoption                                | implementer       | pass                |
| P2c | #3 AC2/6                          | customized prompts survive updates and show changed defaults     | installed SDK/browser      | W4, W1                                  | W                                                                                               | new                   | override/base unchanged, new default visible                                     | implementer       | pass                |
| P2d | #1 ownership/public compatibility | existing customized project files survive explicit adoption      | SDK/file contract          | U5, W4                                  | U, W                                                                                            | new                   | original files remain untouched                                                  | implementer       | pass                |
| P3a | #3 AC3/6                          | unknown role rejected                                            | HTTP                       | U4                                      | U                                                                                               | new                   | traversal role rejected with 400                                                 | implementer       | pass                |
| P3b | #3 AC3/6                          | unknown/missing/malformed template placeholders rejected         | SDK                        | U2                                      | U                                                                                               | new                   | each invalid case retains prior public read                                      | implementer       | pass                |
| P3c | #3 AC3                            | runtime whitespace/mixed-case placeholder syntax supported       | SDK                        | U6                                      | U                                                                                               | new                   | matches existing substitution contract, 40 compatibility tests in U              | implementer       | pass                |
| P3d | #3 AC3                            | completion/output contracts required by runtime preserved        | SDK                        | U2, U6                                  | U                                                                                               | new                   | missing completion, role output and custom output tag rejected                   | implementer       | pass                |
| P3e | #3 AC3                            | invalid save gives actionable error and preserves prior template | browser/SDK                | W1, U2                                  | W, U                                                                                            | new                   | role and missing literal shown; reload retains override                          | implementer       | pass                |
| P3f | #3 AC3; #1 security               | prompt content rendered as data                                  | browser                    | W1                                      | W                                                                                               | new                   | script text retained; no page execution or errors                                | implementer       | pass                |
| P4a | #3 AC4                            | fake model receives selected prompt                              | public run/browser         | W2                                      | W                                                                                               | new                   | fake external executable receives frozen template text                           | implementer       | pass                |
| P4b | #3 AC4; #1 snapshot               | run records exact content/digest and runtime version             | SDK runtime                | U3, U9                                  | U                                                                                               | new                   | selected content/digest, immutable snapshot and version                          | implementer       | pass                |
| P4c | #3 AC4/6                          | editing during execution leaves active run unchanged             | SDK/browser                | U3, W2                                  | U, W                                                                                            | new                   | active snapshot unchanged after save                                             | implementer       | pass                |
| P4d | #3 AC6                            | next-run semantics and CLI/shared runtime resolution             | SDK/CLI/browser            | U3, U8, W2                              | U, W                                                                                            | new                   | next invocation receives saved prompt                                            | implementer       | pass                |
| P5a | #3 AC5; #1 security               | writes confined to selected managed prompt area                  | HTTP/storage/browser       | U4, W3                                  | U, W                                                                                            | new                   | second project isolated; fixed role filenames; directory symlink rejected        | implementer       | pass                |
| P5b | #3 AC5                            | traversal and attempts to touch authentication rejected          | HTTP/storage               | U4                                      | U                                                                                               | new                   | path/auth fields rejected; outside authentication bytes preserved                | implementer       | pass                |
| P5c | #1 security                       | local session, exact origin/host checks remain authoritative     | HTTP                       | U4, U7                                  | U                                                                                               | new                   | shared pre-route guard; hostile prompt Origin rejected                           | implementer       | pass                |
| P5d | #1 security                       | web cannot introduce host executable text                        | SDK                        | U2, U6                                  | U                                                                                               | new                   | new shell expressions and internal control marker rejected                       | implementer       | pass                |
| P6a | #3 AC7                            | document customization and upgrade ownership                     | README/operator guide      | scoped artifact inspection              | D                                                                                               | new                   | SDK examples, ownership/reset/upgrade and HTTP contracts agree                   | implementer       | pass                |
| P6b | #3 AC7; AGENTS.md                 | minor changeset without duplicates                               | changeset artifact         | scoped artifact inspection              | D                                                                                               | new                   | all existing changesets inspected; package name matches manifest                 | implementer       | pass                |
| B1  | feedback loops                    | affected type checks                                             | public SDK types           | package typecheck                       | T                                                                                               | new                   | unchanged production/type source                                                 | implementer       | pass                |
| B2  | feedback loops                    | affected build/consumer contract checks                          | built SDK/CLI/templates    | package build and public-type validator | B                                                                                               | new                   | built declarations and templates, W/U CLI consume completed build                | implementer       | pass                |
| B3  | completion gate                   | task-scoped diff, formatting and final status                    | git/artifacts              | scoped inspection                       | D                                                                                               | new                   | no unrelated initial changes, secrets, generated artifacts or local state staged | implementer       | pass                |
| I1  | feedback loops                    | authoritative integrated full/cumulative gate                    | exact integrated candidate | full gate                               | bash .sandcastle/scripts/verify-affected.sh <batch-base-sha> (includes package/Agent Map gates) | new (future)          | immutable integration baseline and final integrated source                       | integration owner | pending-integration |

## RED/GREEN and diagnosis notes

Resolution first failed at the missing API, then an executable stub produced the
expected missing selected content (16:55 UTC); real resolution passed at 16:56.
Invalid-template test first accepted invalid content, then passed with validation
(16:56–16:57). Snapshot test first selected the original default instead of the
override, then passed with shared resolution (16:57). HTTP security test first
returned unsupported-route 405, then passed with the protected prompt route
(16:58). Browser editor test first timed out on the absent Prompts link, then
passed after UI wiring. Packaged adoption test first lacked its public API,
then passed with explicit ownership selection (17:01). Runtime syntax test
first rejected a spaced built-in placeholder, then passed with runtime-aligned
syntax, generic output tags and control-marker rejection (17:04).

A browser next-run assertion initially observed the preceding completed status;
it now waits for a different run identity before asserting completion. No
product behavior was relaxed. At 17:06 the CLI test ran concurrently with a
build cleaning `dist` and exited 1. This was a scheduling error: after the build
completed, the original four-file command passed all 60 tests at 17:06:52.
There are no unresolved branch failures. No full-gate pass is claimed.

## Documented-artifact validator

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as sdk from './dist/index.js';
const readme = readFileSync('README.md', 'utf8');
const guide = readFileSync('docs/operator.md', 'utf8');
assert.ok(readme.includes('[operator guide](docs/operator.md)') && existsSync('docs/operator.md'));
for (const name of ['loadProjectPrompts', 'saveProjectPrompt', 'usePackagedPromptDefaults']) {
  assert.equal(typeof sdk[name], 'function');
  assert.ok(guide.includes(name));
}
for (const contract of ['GET /api/prompts', 'PUT /api/prompts', 'original base', 'next frozen runtime']) assert.ok(guide.includes(contract), contract);
const change = readFileSync('.changeset/versioned-project-prompts.md', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.ok(change.startsWith(`---\n"${pkg.name}": minor\n---\n`));
console.log('PASS: documented SDK exports, guide link, prompt HTTP/ownership contracts and minor package changeset');
JS
```

The docs website package owns `docs/content/docs`, as declared by
`docs/source.config.ts`; these root-linked Markdown guides do not change its
build inputs. No docs website build is applicable.
