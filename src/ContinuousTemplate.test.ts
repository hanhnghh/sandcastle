// Tests for the continuous supervisor shipped in the parallel-planner-with-review template.
// @ts-nocheck -- exercises plain CommonJS template modules.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "vitest";

const require = createRequire(import.meta.url);
const {
  classify,
  issueOutcomes,
  nextStrikes,
  delayMinutes,
  ownerComment,
  gatedHead,
  referencedIssues,
  integrationBody,
  releaseComment,
} = require("./templates/parallel-planner-with-review/continuous-core.cjs");

const config = { idleMinutes: 15, maxBackoffMinutes: 60 };

test("a clean exit waits for new ready issues", () => {
  const verdict = classify({
    exitCode: 0,
    output: "Branches merged.",
    diagnostic: null,
  });
  assert.equal(verdict.kind, "idle");
  assert.equal(delayMinutes(verdict, 0, config), 15);
});

test("blocked backlog is a wait, not a failure", () => {
  const verdict = classify({
    exitCode: 1,
    output:
      "Error: No eligible batch selected while implementation issues remain. Resolve…",
  });
  assert.equal(verdict.kind, "waiting");
  assert.equal(verdict.notify, false);
});

test("iteration limit starts again immediately", () => {
  const verdict = classify({
    exitCode: 1,
    output: "",
    diagnostic: { code: "iteration-limit", issues: [] },
  });
  assert.equal(verdict.kind, "continue");
  assert.equal(delayMinutes(verdict, 0, config), 0);
});

test("provider outage backs off to the maximum and notifies", () => {
  const verdict = classify({
    exitCode: 1,
    output: "Provider unavailable after 3 consecutive provider failures",
    diagnostic: null,
  });
  assert.equal(verdict.kind, "provider");
  assert.equal(verdict.notify, true);
  assert.equal(delayMinutes(verdict, 1, config), 60);
});

test("no progress retries instead of asking the owner", () => {
  const verdict = classify({
    exitCode: 1,
    output:
      "Approach escalated for issue 512 (scope); branch retained for the owner.\nNo verified implementation progress.",
    diagnostic: { code: "no-progress", issues: [500, 512] },
  });
  assert.equal(verdict.kind, "no-progress");
  assert.deepEqual(verdict.ownerIssues, []);
  assert.equal(verdict.notify, false);
});

const RUN_LOG = [
  "Planning complete. 3 issue(s) to work in parallel:",
  "  489: M0.1 Measure editor load → sandcastle/issue-489",
  "  492: E1.1 Three-column editor → sandcastle/issue-492",
  "  493: E1.2 Rail → sandcastle/issue-493",
  "  ! 489 attempt 1 failed (task): Error: Progress checkpoint cap-reached for issue 489",
  "  ! 492 attempt 1 failed (infrastructure): WorktreeTimeoutError: Worktree creation timed out after 30000ms",
  "  ! 492 attempt 2 failed (infrastructure): WorktreeTimeoutError: Worktree creation timed out after 30000ms",
  "  ✗ 489 (sandcastle/issue-489) failed: TaskAttemptsError: Error: Progress checkpoint cap-reached",
  "  ✗ 492 (sandcastle/issue-492) failed: TaskAttemptsError: WorktreeTimeoutError: timed out",
].join("\n");

test("only task failures count against an issue", () => {
  assert.deepEqual(issueOutcomes(RUN_LOG), {
    worked: [489, 492, 493],
    failed: [489],
  });
});

test("an issue goes to the owner only after failing runs in a row", () => {
  const first = nextStrikes({}, issueOutcomes(RUN_LOG), 2);
  assert.deepEqual(first, { strikes: { 489: 1 }, ownerIssues: [] });
  const second = nextStrikes(first.strikes, issueOutcomes(RUN_LOG), 2);
  assert.deepEqual(second, { strikes: {}, ownerIssues: [489] });
});

test("a worked issue that does not fail starts over; an unworked one keeps its count", () => {
  const next = nextStrikes(
    { 489: 1, 500: 1 },
    { worked: [489], failed: [] },
    2,
  );
  assert.deepEqual(next, { strikes: { 500: 1 }, ownerIssues: [] });
});

test("unknown failures back off exponentially up to the maximum", () => {
  const verdict = classify({ exitCode: 2, output: "TypeError: boom" });
  assert.equal(verdict.kind, "failure");
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((n) => delayMinutes(verdict, n, config)),
    [5, 10, 20, 40, 60],
  );
});

test("owner comment names the label and has no closing keyword", () => {
  const text = ownerComment(
    "no-progress",
    "A batch made no verified progress.",
    "2026-10-22T00:00:00Z",
  );
  assert.match(text, /needs-owner/);
  assert.doesNotMatch(
    text,
    /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b\s*#\d+/i,
  );
});

test("integration body lists referenced issues without closing keywords", () => {
  const issues = referencedIssues(
    "RALPH: feat(x)\nRefs #491.\n\nMerge\nRefs #489 (parent #488).\nRefs #491",
  );
  assert.deepEqual(issues, [489, 491]);
  const body = integrationBody("sandcastle/continuous", issues);
  assert.match(body, /- Refs #489\n- Refs #491/);
  assert.doesNotMatch(
    body,
    /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b\s*#\d+/i,
  );
  assert.match(
    releaseComment(552, "abcdef0123456789", "2026-10-22T12:00:00Z"),
    /#552 \(merge abcdef012345/,
  );
});

test("the last gated integration head is published, partial or other lines are not", () => {
  const a = "a".repeat(40);
  const b = "b".repeat(40);
  assert.equal(gatedHead("Branches merged."), null);
  assert.equal(
    gatedHead(
      `Gated integration head ${a}\nnoise\nGated integration head ${b}\n`,
    ),
    b,
  );
  assert.equal(gatedHead(`  Gated integration head ${a}`), null);
  assert.equal(gatedHead(`Gated integration head ${a.slice(0, 12)}`), null);
});
