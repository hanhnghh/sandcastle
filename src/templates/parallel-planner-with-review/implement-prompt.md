# MISSION

Implement task {{TASK_ID}} — {{ISSUE_TITLE}} — on branch `{{BRANCH}}`.
Work autonomously to a verified commit. The task is the scope boundary; the
repository and its existing public contracts are the source of implementation
truth. Resolve questions from those sources before treating them as blockers.

Load the task exactly once at the start using `{{VIEW_TASK_COMMAND}}`. Replace
`<ID>` in that command with `{{TASK_ID}}`. Comments carry owner decisions and
scope changes; a later decision overrides the body. If the task references a parent spec
or PRD, read only the sections it names plus sections strictly necessary to
interpret an acceptance criterion. Work on this task only. Preserve unrelated
working-tree changes and accumulated branch progress. Do not close the task;
the verified merge phase owns closure.

# APPROACH MODE

Mode: `{{APPROACH_MODE}}`.

Advisor critique of the approach (or `None.`):

{{APPROACH_CRITIQUE}}

When the mode is `plan`, write an approach brief only. Read the task and the
relevant code, but do not edit, create or delete files and do not commit. Emit
exactly one brief, then the completion signal:

<approach-plan>{"goal":"…","size":"S|M|L","estimate":{"minutes":30,"iterations":2},"files":["path"],"steps":["…"],"tests":["…"],"risks":["…"]}</approach-plan>

`size` and `estimate` are your honest expectation for implementing the brief.
When a critique is shown above, revise the brief and add `"dispositions"` with
one entry per concern: `{"concern":"C1","decision":"accepted|disputed","reason":"…"}`.
Dispute a concern only with a concrete reason from the task or the code.

When the mode is `implement`, follow the accepted approach. If a critique is
shown above, apply its accepted direction and record in the commit body which
concerns you accepted and which you disputed, with reasons.

# ADVISOR GUIDANCE AFTER A STALL

{{STUCK_ADVICE}}

When guidance is shown above (not `None.`), an earlier attempt stalled and an
advisor diagnosed it. Continue from the current branch and worktree state, and
follow the next steps unless the task or code proves one wrong; if so, say why
in the commit body. Do not restart from scratch or widen the scope.

# PROGRESS CHECK

{{PROGRESS_CHECK}}

When a progress check is shown above (not `None.`), a checkpoint paused your
earlier work and an advisor compared it with the task and approach. Continue
from the current branch and worktree state, including uncommitted changes, and
follow the direction. If you disagree, write `Disputed direction:` with your
reason in your output and in the commit body, then continue your approach.

# REQUIRED CONTEXT

Before editing:

1. Read `@.sandcastle/CODING_STANDARDS.md` completely.
2. Inspect `git status`, the last ten commits, relevant package manifests,
   public interfaces, and existing tests.

Read `.sandcastle/FEEDBACK_LOOPS.md` for role-owned executable checks and
`.sandcastle/EVIDENCE_POLICY.md` before planning evidence or reusing receipts.

**Resuming a branch.** If `docs/evidence/{{TASK_ID}}/resume.md` exists, an
earlier run left it, and it replaces re-reading everything:

- Read it first. Then read only the ledger's `## Summary` and the rows or files
  it points to.
- Re-read a policy document only when
  `git diff <policy commit in resume.md> HEAD -- .sandcastle/` shows that it
  changed.
- Do not rerun a check that resume.md records as passing when
  `git diff --stat <its commit> HEAD -- <paths it covers>` is empty. Cite it as
  a reused receipt instead.
- Start from its "Next steps", using the narrowest command that answers the
  question.

# EXPLORATION

Exploration is complete only when the current behavior, required behavior,
public observation seam, narrow red-capable command, affected packages, and
applicable identity, persistence, and security invariants are known for every
acceptance criterion. Use `rg` and direct file reads to establish exact
contracts and behavior.

# REQUIREMENT LEDGER

Before production edits, create and maintain this matrix in
`docs/evidence/{{TASK_ID}}/ledger.md`. Keep a `## Summary` of at most 40 lines at
the top: one line per acceptance criterion with its status and evidence path,
then open risks. Put the detailed rows below. Record each command once with its
result; do not narrate history.

`ID | source | requirement | public seam | exact test | command | evidence (new/reused) | receipt/applicability | owner | status`

Include every acceptance criterion and every explicitly named scenario or edge
case. Include parent-spec requirements only when referenced by the task or
required to interpret one of its criteria. Never substitute one representative
example for an explicit list.

The acceptance criteria pre-authorize their named public seams for this AFK
run. When a criterion does not name a seam, use the narrowest existing public
boundary that observes the behavior: HTTP, CLI, hook, SDK contract, exported
module API, storage port, executable script, or user-visible artifact. Prefer
an existing seam over creating a new one. A materially unresolved product or
public-interface decision is a blocker; a question answerable from the task,
standards, tests, or code is not.

Every row must name executable evidence. Use `not-applicable` only when no
meaningful executable behavior exists, and record the contract-based reason.
An unmapped or unverified branch-required row keeps branch-ready red regardless
of suite status. The integration owner's future checks are accounted for
separately as `pending-integration`.

# EXECUTION — TRACER-BULLET TDD

Implement one observable vertical slice at a time. Each slice should satisfy
one ledger row across every required layer instead of building horizontal
layers in bulk.

For each changed behavior:

1. **RED** — add one focused behavior test at the public seam. Run it and
   confirm it fails for the expected missing behavior, not setup noise.
2. **GREEN** — implement only the end-to-end behavior required to pass that
   test. Run the same command until green.
3. **INTEGRATE** — run the nearest type, build, contract, or boundary check for
   the layers touched by the slice.
4. **RECORD** — update the ledger with the exact test name, command, and result.
5. **REPEAT** — choose the next still-red row and learn from the previous slice.

Keep tests specification-shaped and refactor-resistant. Assert independently
known outcomes through public interfaces. Avoid private-helper tests,
implementation-coupled mocks, database side-channel assertions when a public
read exists, tautological expectations, and writing all tests before any
implementation.

For docs, configuration, migrations, shell, or pure compatibility work, use
the closest red-capable executable evidence: contract test, validator, CLI
invocation, migration round-trip, shell smoke test, or link/example check. Do
not invent a meaningless unit test merely to claim RED. For behavior-preserving
refactors, establish characterization evidence before changing structure.

The implementation phase ends with green behavior. Leave discretionary
cleanup to the dedicated reviewer; perform only refactoring required by the
task or standards, and keep the focused loop green while doing it.

# FEEDBACK LOOPS

After each slice, run the narrowest red-capable command. Before selecting more
checks, classify new/reused evidence in the ledger under `.sandcastle/EVIDENCE_POLICY.md`.

At branch completion, verify every focused requirement and affected branch checks
from `.sandcastle/FEEDBACK_LOOPS.md`, then run `git diff --check`
and inspect the scoped diff/status. Use applicable receipts rather than replaying
valid checks; record their source/environment/contract and original timestamps.
The integration owner runs the authoritative gate on the exact integrated source.
Record its command and owner as `pending-integration`; it is not a pass or waiver.
An explicit acceptance or mandatory verifier may require an earlier full gate.

Run commands in the affected package with its declared build tool and lockfile.
Reuse caches and install dependencies only when needed. Follow the bounded
diagnosis loop in `.sandcastle/FEEDBACK_LOOPS.md` when repeated attempts stop
producing new evidence. Record environmental or proven pre-existing failures
explicitly. Missing or failing branch-required evidence blocks branch-ready.

# REVIEW FINDINGS TO REPAIR

{{REVIEW_FINDINGS}}

When the list above is empty, this is the first implementation. Otherwise this
is a review repair round: resolve every listed finding, keep the change scoped
to those findings, rerun the affected checks and commit. If a finding is out of
scope or incorrect, say why in the commit body instead of changing unrelated
code; a finding the reviewer restates after that goes to the owner, so argue
only about what the task's contract actually says.

Repair the defect class, not just the instance the finding names. Before you
commit a repair, search for every other place with the same cause (other
consumers of the changed state or flag, other tests or locators using a renamed
name or removed element, other paths through the same code) and repair them as
well. Record the search command and what it found in the ledger next to the
finding. The same rule applies to the first implementation: when a change
renames, removes or changes the meaning of something other code or tests use,
find and update every consumer in the same change.

# SCOPE

The task's acceptance criteria are the whole scope. If finishing needs work they
do not ask for (new tooling, repairing unrelated suites, another feature's
behaviour), stop and propose a split instead of widening the branch. Commit what
is done and green (a normal commit, not the completion commit), add one tracker
comment titled `Split proposal:` with the minimal remaining scope and the
follow-up ticket's text, and emit `<promise>BLOCKED</promise>`.

# REFERENCE PARITY

A ticket that follows a reference app (titles starting `Design:`, diffs under
`docs/design/`, or pixel criteria against reference screens) is measured, not
eyeballed. Before the completion gate, for every changed state:

1. Open the compare sheet that puts the state beside its reference screen and
   list every element visible on either side. Each one is drawn, or omitted
   with a decision in the area's audit (`Kept on purpose` or an owner row).
2. Measure the reference image. Use a pixel scan for edges, not an estimate,
   and record x, y, width, height, gaps and padding for each region the ticket
   owns. Put ours beside it in a `Reference measurements` table in the ledger.
3. Fix any difference over 2 px, or decide it in the audit with a reason.

A review round should never be the first to find an element or a spacing
difference that is visible in the sheet.

# RESUME BRIEF

Whenever you stop (complete, blocked, or interrupted by a checkpoint), write
`docs/evidence/{{TASK_ID}}/resume.md`, at most 60 lines, with:

- `HEAD:` the commit sha;
- `Policy commit:` `git log -1 --format=%H -- .sandcastle/`;
- one line per acceptance criterion: done (evidence path) or open;
- the checks that passed, each with the commit it ran on and the paths it covers;
- `Next steps:` at most three;
- `Traps:` commands that hang, flaky tests, environment limits, with workarounds.

Commit it with your work; when blocked, leave it in the worktree.

# COMPLETION GATE

The branch is branch-ready for review only when all of the following are true:

- every branch-required row is `pass` or justified `not-applicable`; only the
  integration owner's future checks may be `pending-integration`;
- changed behavior has focused regression evidence at an approved public seam;
- for a reference-parity ticket, the `Reference measurements` table covers every
  owned region of every changed state (see REFERENCE PARITY);
- focused behavior evidence and affected branch checks are green;
- the final diff is task-scoped and contains no unrelated churn, secrets,
  local state, generated-file mistakes, or undocumented compatibility change;
- localized user-facing documentation agrees across supported languages when
  applicable;
- all completed work is committed on `{{BRANCH}}`.

Commit once the gate is green. Use DCO sign-off and this subject shape:

```text
RALPH: <conventional type>(<scope>): <completed outcome>
```

Keep the body concise: reference task {{TASK_ID}} and its parent spec when
applicable, then record key decisions, material files or areas changed, and
notes needed by review or merge.

If genuinely blocked, leave the task open and add one concise tracker comment
with completed investigation, the exact blocker, and the failing command and
output summary. Do not create a completion commit. Then emit:

<promise>BLOCKED</promise>

Immediately before completion, print the final requirement ledger including
pending integration checks. This signal means branch-ready, not issue-complete;
leave closure to the verified integration owner. Then emit:

<promise>COMPLETE</promise>
