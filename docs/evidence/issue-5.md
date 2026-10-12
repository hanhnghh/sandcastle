# Task 5 requirement ledger

Task #5 was loaded successfully in full with
`gh issue view 5 --json number,title,body,labels,comments` at the start on
2026-10-12. Parent `hanhnghh/sandcastle#1` supplies the configuration ownership,
frozen inputs, loopback security, compatibility and browser acceptance contracts.
Baseline: `256f63bf6ddf13f2301224e3571fd1d14ecd8bf8`. Branch:
`sandcastle/issue-5`, initially clean. The task remains open for verified integration.

Environment: Linux, Node v24.21.0, npm 11.19.0, package-lock.json, installed
Vitest 3.2.4, TypeScript native preview and Playwright 1.63.0/Chromium.
Dependencies were already installed; bootstrap was unnecessary. Evidence is new
execution for this task, including retained regression tests. No old branch or
full-gate receipt is reused. The already-passing **N** and unaffected **W0** runs retain their
original timestamps below; the later F command excludes only N's four tests to
avoid replaying applicable evidence. Their interpreting harness and product
source have not changed. The workflow browser harness subsequently gained an
explicit two-project repository test; W reran that affected file only. All ten
F/N product and TypeScript harness hashes remain unchanged from the earlier
manifest (archived as issue-5-source-before-browser.sha256). Source/harness manifest:
`.sandcastle/logs/issue-5-source.sha256`, SHA-256
`4ee59fbf4a45362b2fb941578a9ad60b3d76e8478ab63c39006d78f5e0cccdb5`.
This is provenance for focused evidence, not trusted integration proof.

CodeGraph explore/query/node/impact/affected identified operator, runtime,
CLI and init callers. Graph misses for new workflow symbols and exact template
wire contracts were resolved by direct reads. Required host coding standards,
feedback loops and evidence policy were read completely before editing.

## Executable commands

- **F**: `npm test -- src/OperatorWorkflow.test.ts src/Operator.test.ts src/OperatorEnvironment.test.ts src/OperatorPrompts.test.ts src/OperatorCli.test.ts src/OperatorGenerated.test.ts src/Readiness.test.ts src/ReadinessPolicy.test.ts src/ReadinessWorkflow.test.ts src/InitService.test.ts src/InitService.agents.test.ts src/InitService.packageManager.test.ts src/InitService.sandboxProviders.test.ts src/run.test.ts -t '^(?!configured Codex workflow)' --run`
- **N**: `npm test -- src/ReadinessWorkflow.test.ts -t 'configured Codex workflow' --run`
- **W**: `node --test scripts/operator-workflow.browser.test.mjs`
- **W0**: `node --test scripts/operator-workflow.browser.test.mjs scripts/operator.browser.test.mjs scripts/operator-environment.browser.test.mjs` (original 16:29 run; the nine unchanged operator/environment tests remain applicable, and W replaced its workflow-file receipt)
- **T**: `npm run typecheck`
- **B**: `npm run build` (including public Effect-free declaration validation)
- **D**: `git diff --check` and `npx prettier --check README.md docs/operator.md .changeset/operator-workflow-settings.md src/OperatorWorkflow.ts src/OperatorWorkflow.test.ts src/OperatorRuntime.ts src/OperatorServer.ts src/OperatorCli.test.ts src/OperatorGenerated.test.ts src/ReadinessWorkflow.test.ts src/InitService.ts src/index.ts src/operatorAssets.ts scripts/operator-workflow.browser.test.mjs docs/evidence/issue-5.md`
- **A**: `node --input-type=module` documentation example validator below.
- **I**: `bash .sandcastle/scripts/verify-affected.sh <batch-base-sha>` on the exact integrated committed source. The integration owner supplies its immutable batch baseline. This owns the authoritative typecheck/full npm test/build/Agent Map browser gate, not a branch pass or waiver.

## Exact test names

- **E1**: workflow settings persist without changing project standards or qualification adapters
- **E2**: invalid workflow settings are atomic through the project-scoped HTTP interface
- **E3**: frozen workflow schedules at its configured concurrency and later saves affect only later runs
- **E4**: trusted feedback gates and verifier execute only frozen declarations and retain project holds
- **E5**: HTTP observes frozen workflow outcomes without exposing declarations or credential output
- **E6**: workflow files and configuration directories cannot route settings into another project via symlinks
- **E7**: reopening a runtime rejects tampered trusted feedback policy and effective holds are immutable
- **E8**: legacy frozen role records reopen without inventing workflow policy
- **C1**: operator CLI serves only its explicit project and hands its frozen runtime to the fixed workflow
- **G1**: generated 'parallel-planner-with-review'/'node', 'codex-afk'/'node', and 'codex-afk'/'android' uses the selected immutable image at Docker's boundary (now also missing-repository rejection before launch)
- **G2**: generated parallel-planner-with-review / codex-afk stops at the saved cycle limit without starting a later task
- **G3**: shared Codex runtime preserves 'fresh admission', 'blocked completion', 'blocked review', 'merger completion', 'readiness checkout integrity', and 'post-merge verification' guards
- **G4**: configured Codex workflow records 'no-progress' / 'qualification-pending' without closing unfinished issues
- **G5**: configured Codex workflow cannot implement held or meta tasks: READINESS_FIXTURE_HOLD / READINESS_FIXTURE_META
- **R1**: requires completed and integrated nested/cross-repo dependencies: open / not_planned / missing integration / not ancestor / integrated
- **R2**: rejects stale-head / edited-contract / open-dependency / unintegrated-producer instead of trusting a ready proposal
- **R3**: defaults to report-only, assesses the full scoped contract and records an audit without GitHub writes
- **R4**: fails closed for changed comments / changed body / changed labels / changed branch / dirty checkout / missing verifier (and retained parameterized publication cases); rejects a tracker edit during final publication readback and retains the journal; rejects a change to an already published issue while another issue is being published
- **R5**: does not admit a manually ready meta task; preserves manual holds and excludes held or blocked issues from planning; rejects a stale batch before execution when body / hold / closed / source / branch / duplicate changes
- **R6**: stops a no-progress batch after one implementation attempt; reports pending external qualification without implementing or closing its issue; reviews retained branch commits before integration when the resumed implementer adds none
- **W1**: workflow browser configuration and diagnostics: persistence, keyboard, limits, invalid settings, verifier, gate failure and qualification
- **W2**: existing operator/environment browser regression names retained in W0 (nine unchanged tests)
- **W3**: workflow browser repository settings and frozen runs isolate selected projects

W and retained W0 cover eleven distinct passing browser tests.

## Final requirement matrix

Receipt/applicability **S** means the source/harness manifest above and Linux
fake provider/tracker/Docker process boundaries, with real runtime/orchestration,
Git fixtures, HTTP and Playwright where named. **P** means the unchanged public
readiness/policy validators plus the configured generated consumer in S.
**L** means English-only root README/operator guide, new uniquely named minor
changeset and the documented public SDK example validator; no translated
operator document exists. Each row is independently mapped; no future branch
work is hidden in the integration row.

| ID  | source                    | requirement                                                                            | public seam                              | exact test                                                                         | command | evidence (new/reused) | receipt/applicability                                     | owner             | status              |
| --- | ------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- | ------- | --------------------- | --------------------------------------------------------- | ----------------- | ------------------- |
| 01  | #5 AC1,6                  | Web/CLI shared save/reload                                                             | HTTP, SDK, CLI                           | E1, E2, C1, W1                                                                     | F, W    | new                   | S                                                         | implementer       | verifying           |
| 02  | #5 AC1                    | Invalid labels reject atomically                                                       | HTTP                                     | E2: control/shell syntax, state/hold collision                                     | F       | new                   | S                                                         | implementer       | verifying           |
| 03  | #5 AC1                    | Invalid repository rejects atomically                                                  | HTTP                                     | E2: URL instead of owner/repository                                                | F       | new                   | S                                                         | implementer       | verifying           |
| 04  | #5 AC1                    | Invalid limits reject atomically                                                       | HTTP                                     | E2: zero cycles, fractional concurrency, excess planner attempts                   | F       | new                   | S                                                         | implementer       | verifying           |
| 05  | #5 AC1                    | Invalid gate/verifier references reject atomically                                     | HTTP                                     | E2: unknown references, missing apply verifier                                     | F       | new                   | S                                                         | implementer       | verifying           |
| 06  | #5 AC1                    | Preserve unrelated standards and qualification adapters                                | SDK, frozen policy                       | E1, E4                                                                             | F       | new                   | S                                                         | implementer       | verifying           |
| 07  | #5 AC2                    | Concurrency changes actual fake-run scheduling, settles failures                       | Runtime API, browser fake provider       | E3, W1                                                                             | F, W    | new                   | S                                                         | implementer       | verifying           |
| 08  | #5 AC2                    | Iteration settings stop actual generated workflows                                     | Generated workflow/provider/tracker      | G2 both templates                                                                  | F       | new                   | S                                                         | implementer       | verifying           |
| 09  | #5 AC2,5; #1 freeze       | Active configuration immutable; saves only affect later runs                           | Runtime API, HTTP, CLI                   | E3, E5, E7, C1                                                                     | F       | new                   | S                                                         | implementer       | verifying           |
| 10  | #5 AC3,6                  | Explicit repository; project/repository isolation                                      | HTTP, CLI, generated tracker/process     | E1, E2, C1, G1, G3                                                                 | F       | new                   | S: fake gh rejects wrong GH_REPO; upstream remote differs | implementer       | verifying           |
| 11  | #5 AC3                    | Dependencies completed and integrated                                                  | Readiness/policy API, generated tracker  | R1 all five states, R2 open/unintegrated, generated two-batch workflow             | F       | new                   | P                                                         | implementer       | verifying           |
| 12  | #5 AC3                    | Holds cannot be bypassed by settings/proposals                                         | Runtime policy, generated workflow       | E4, E7, R5 hold, G5 HOLD                                                           | F, N    | new                   | P: configured limits; trusted holds retained              | implementer       | verifying           |
| 13  | #5 AC3                    | Meta tasks cannot be bypassed                                                          | Readiness API, generated workflow        | R5 meta, G5 META                                                                   | F, N    | new                   | P                                                         | implementer       | verifying           |
| 14  | #5 AC3                    | Stale source/contracts cannot be bypassed                                              | Admission, policy, generated workflow    | R2 stale/edited, R4, R5 stale batch, G3 fresh admission/checkout                   | F       | new                   | P                                                         | implementer       | verifying           |
| 15  | #5 AC3                    | Incomplete reviews cannot be bypassed                                                  | Generated workflow                       | G3 blocked review/completion/merger, R6 retained commits                           | F       | new                   | P                                                         | implementer       | verifying           |
| 16  | #5 AC4                    | Report-only default; apply requires trusted verifier                                   | SDK, HTTP, browser, readiness API        | E1, E2, E4, R3, R4 missing verifier, W1                                            | F, W    | new                   | S, P                                                      | implementer       | verifying           |
| 17  | #5 AC4                    | Full-contract/publication integrity retained                                           | Readiness/policy API, generated workflow | R2, R4 publication cases, G3 post-merge                                            | F       | new                   | P                                                         | implementer       | verifying           |
| 18  | #5 AC4,6                  | Web shows missing verifier, gate failures, pending qualification                       | HTTP, browser                            | E5, W1                                                                             | F, W    | new                   | S                                                         | implementer       | verifying           |
| 19  | #5 AC5                    | Execute only frozen project-declared commands/references; required gates retained      | Runtime verification API                 | E2 rejects executable fields, E4 required gate and changed declarations, E7 tamper | F       | new                   | S                                                         | implementer       | verifying           |
| 20  | #5 AC5                    | Config/diagnostics exclude credential values                                           | HTTP, browser, runtime API               | E2 rejects credential fields, E4 safe error and hidden argv, E5, W1                | F, W    | new                   | S                                                         | implementer       | verifying           |
| 21  | #5 AC6                    | No-progress and qualification-only outcomes with fake boundaries                       | Generated workflow, HTTP/browser         | G4 both outcomes, R6, E5, W1                                                       | F, N, W | new                   | S                                                         | implementer       | verifying           |
| 22  | #1 security/compatibility | Loopback/session/project boundaries; symlink isolation; old frozen roles remain usable | HTTP, SDK, browser                       | E2 origin/query, E6, E8; retained Operator tests, W2                               | F, W    | new                   | S                                                         | implementer       | verifying           |
| 23  | #5 AC6                    | Document; unique minor changeset                                                       | User-visible artifacts, public SDK       | A documented JSON examples; D inspection                                           | A, D    | new                   | L                                                         | implementer       | verifying           |
| 24  | feedback loops            | Affected SDK/CLI/template type/build checks                                            | Package/compiler/declarations            | F affected callers, T, B                                                           | F, T, B | new                   | S                                                         | implementer       | verifying           |
| 25  | feedback loops            | Exact integrated-source authoritative gate                                             | Integration script                       | Cumulative package/browser qualification                                           | I       | future                | Exact integrated source and immutable batch base          | integration owner | pending-integration |

## Tracer-bullet and diagnosis record

- Persistence RED 16:10 UTC: public load API absent. GREEN 16:11: save/reload
  and preservation test passes, followed by typecheck.
- HTTP validation RED 16:12: route returned 404. GREEN: protected GET/PUT,
  atomic rejection and safe errors pass. An overly specific error-prefix
  expectation was resolved with a consistent workflow field prefix; unknown
  JSON response type fixed before typecheck passed.
- Frozen scheduling RED 16:12: workflow evidence absent. GREEN 16:13: reopened
  runtime retains limits, real fake callbacks reach concurrency 2 versus 1,
  failures settle and later saves do not affect active evidence.
- Feedback RED 16:14: required-gate declaration unsupported. GREEN: frozen
  trusted argv, mandatory gates/holds, JSON verifier input and safe failure
  diagnostics pass; no issue/model executable text is interpreted.
- Generated cycles RED 16:15: both templates completed the later task despite
  saved cycles=1. GREEN 16:17: both stop after the first integrated batch.
- HTTP outcomes RED 16:17: diagnostics absent. GREEN 16:18: public runtime
  outcome reporting is observed through HTTP and survives the CLI child seam.
- Browser RED 16:19: workflow form absent. GREEN 16:21: save/reload, errors,
  keyboard, changed fake concurrency, gate failure and qualification pass.
  Browser selector initially matched both Readiness model and Readiness mode;
  exact label matching repaired this harness ambiguity without product changes.
- Symlink RED 16:21: redirected config was readable. GREEN: reads/saves reject
  file/directory links and preserve the other project.
- Integrity RED 16:22: effective holds were mutable. GREEN 16:23: deep freeze
  and frozen policy/declaration digest verification, including tampered reopen.
- Explicit repository RED 16:24: missing repository reached Docker agent launch.
  GREEN 16:29: all three generated Node/Android consumers stop before launch.
  Enabling real readiness exposed untracked fixture bin/dependency/log files;
  ignoring owned runtime artifacts and committing fixture source restored the
  independent clean-checkout invariant. This was a proven harness issue, not a
  product waiver. Selected immutable image/auth/cache mount regressions still pass.
- Legacy records RED 16:27: role-only record rejected on reopen. GREEN 16:29:
  original operations remain compatible; new workflow operations fail explicitly
  rather than reading live policy.
- N passed 2026-10-12 16:31:07 UTC: four new configured workflow cases, 32.88s.
  Source/harness unchanged afterward. W passed 16:29:47 UTC: ten operator
  browser tests, 10.95s. B passed 16:29 UTC including public type validation;
  only the ReadinessWorkflow test harness changed afterward, not build inputs.
- Final F passed: 2026-10-12 16:32:30 UTC start, 237.07s, 483 passed and
  exactly N's four previously verified tests excluded. F + N cover all 487
  focused tests. Receipt: ignored `.sandcastle/logs/issue-5-focused.log` plus
  the tool execution's exit code 0. No source or TypeScript harness changed
  during/after F. Final T passed at 16:32 UTC. D formatting/diff checks passed.
- W passed at 16:37 UTC: two current workflow browser tests, 4.74s, including
  explicit two-project repository isolation and separately frozen run views.
  Together with the nine unchanged W0 tests, eleven distinct browser tests pass.
- Documentation example validator A passed; every existing changeset was
  inspected before adding the uniquely named minor changeset. English operator
  documentation has no localized counterpart requiring an update. Final scoped
  inspection excludes generated builds, credentials and ignored receipts/logs.
  No unknown environment failure is classified as pre-existing or waived.
- All branch-required rows pass. I remains pending-integration and the issue
  remains open. Completion denotes a signed-off task-scoped commit ready for
  review, not integration verification or issue closure.

## Documentation example validator (A)

Executed 2026-10-12 with `node --input-type=module`; passed. The executable
checks the documented workflow and host declaration examples through the built
public save/read/inspect APIs, and the changeset package/minor contract:

````js
import assert from "node:assert/strict";
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveWorkflowConfig,
  loadWorkflowConfig,
  inspectWorkflow,
} from "./dist/index.js";
const guide = await readFile("docs/operator.md", "utf8");
const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
  JSON.parse(match[1]),
);
const workflow = examples.find((example) =>
  Object.hasOwn(example, "repository"),
);
const declarations = examples.find((example) =>
  Object.hasOwn(example, "verifiers"),
);
assert.ok(workflow);
assert.ok(declarations);
const cwd = await mkdtemp(join(tmpdir(), "workflow-docs-"));
try {
  await mkdir(join(cwd, ".sandcastle"));
  await writeFile(
    join(cwd, ".sandcastle/feedback-gates.json"),
    JSON.stringify(declarations),
  );
  const saved = await saveWorkflowConfig({ cwd, config: workflow });
  assert.deepEqual(await loadWorkflowConfig({ cwd }), saved);
  const view = await inspectWorkflow({ cwd });
  assert.deepEqual(view.requiredGates, ["tests"]);
  assert.deepEqual(view.references.verifiers, ["project"]);
  const changeset = await readFile(
    ".changeset/operator-workflow-settings.md",
    "utf8",
  );
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.ok(changeset.includes(`"${pkg.name}": minor`));
  await access("docs/operator.md");
} finally {
  await rm(cwd, { recursive: true, force: true });
}
````
