import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  formatPreviousFindings,
  isSweepRound,
  openReviewRounds,
  reviewEscalation,
  reviewEscalationComment,
  reviewHistoryStore,
} from "./ReviewHistory.js";
import type { ReviewFinding, ReviewRound } from "./ReviewLoop.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const store = () => {
  const directory = mkdtempSync(join(tmpdir(), "review-history-"));
  directories.push(directory);
  return reviewHistoryStore(join(directory, "runs", "review-history.json"));
};
const finding = (
  id: string,
  extra: Partial<ReviewFinding> = {},
): ReviewFinding => ({ id, severity: "major", change: `fix ${id}`, ...extra });
const changes = (...findings: ReviewFinding[]): ReviewRound => ({
  round: 1,
  verdict: "changes-requested",
  findings,
  repaired: true,
});
const policy = { sweepFrom: 3, roundCap: 7, repeatLimit: 2 };

test("rounds are numbered per issue across loops and persist in the file", () => {
  const history = store();
  history.record("501", changes(finding("F1")));
  history.record("501", changes(finding("F1")));
  history.record("502", changes(finding("F1")));
  expect(history.read("501").rounds.map((round) => round.round)).toEqual([
    1, 2,
  ]);
  expect(history.read("502").rounds).toHaveLength(1);
  expect(history.read("999")).toEqual({ rounds: [] });
});

test("previous findings list unresolved rounds with stable keys", () => {
  const history = store();
  expect(formatPreviousFindings(history.read("1"))).toBe("None.");
  history.record("1", changes(finding("F1", { file: "a.ts" })));
  expect(formatPreviousFindings(history.read("1"))).toBe(
    "- [R1.F1] (major) a.ts: fix F1",
  );
});

test("a major finding restated twice escalates; a minor one or a new one does not", () => {
  const history = store();
  history.record("1", changes(finding("F1")));
  history.record("1", changes(finding("F1", { repeats: "R1.F1" })));
  expect(reviewEscalation(history.read("1"), policy)).toBeUndefined();
  const third = history.record(
    "1",
    changes(finding("F1", { repeats: "R2.F1" }), finding("F2")),
  );
  const escalation = reviewEscalation(third, policy);
  expect(escalation?.reason).toBe("repeated-finding");
  expect(
    escalation?.findings.map((entry) => [entry.key, entry.restated]),
  ).toEqual([["R3.F1", 2]]);

  const minor = store();
  minor.record("1", changes(finding("F1", { severity: "minor" })));
  minor.record(
    "1",
    changes(finding("F1", { severity: "minor", repeats: "R1.F1" })),
  );
  const last = minor.record(
    "1",
    changes(finding("F1", { severity: "minor", repeats: "R2.F1" })),
  );
  expect(reviewEscalation(last, policy)).toBeUndefined();
});

test("a repeats key that names no earlier finding does not count", () => {
  const history = store();
  const last = history.record(
    "1",
    changes(finding("F1", { repeats: "R9.F9" })),
  );
  expect(reviewEscalation(last, { ...policy, repeatLimit: 1 })).toBeUndefined();
});

test("the round cap escalates and the owner hand-off restarts the count", () => {
  const history = store();
  for (let round = 1; round < 7; round++)
    history.record("1", changes(finding(`F${round}`)));
  expect(reviewEscalation(history.read("1"), policy)).toBeUndefined();
  const capped = history.record("1", changes(finding("F7")));
  expect(reviewEscalation(capped, policy)).toMatchObject({
    reason: "round-cap",
    openRounds: 7,
  });
  history.markEscalated("1");
  expect(openReviewRounds(history.read("1"))).toEqual([]);
  expect(formatPreviousFindings(history.read("1"))).toBe("None.");
  const next = history.record("1", changes(finding("F1")));
  expect(next.rounds.at(-1)?.round).toBe(8);
  expect(reviewEscalation(next, policy)).toBeUndefined();
});

test("approval never escalates and zero disables each limit", () => {
  const history = store();
  for (let round = 1; round <= 8; round++)
    history.record("1", changes(finding("F1")));
  expect(
    reviewEscalation(history.read("1"), { ...policy, roundCap: 0 }),
  ).toBeUndefined();
  const approved = history.record("1", {
    round: 9,
    verdict: "approve",
    findings: [],
    repaired: false,
  });
  expect(reviewEscalation(approved, policy)).toBeUndefined();
  expect(isSweepRound(2, policy)).toBe(false);
  expect(isSweepRound(3, policy)).toBe(true);
  expect(isSweepRound(9, { ...policy, sweepFrom: 0 })).toBe(false);
});

test("the owner comment carries the decision options and open findings", () => {
  const comment = reviewEscalationComment(
    {
      reason: "repeated-finding",
      openRounds: 4,
      findings: [
        { key: "R4.F1", finding: finding("F1", { file: "a.ts" }), restated: 2 },
      ],
      decision: {
        question: "Should History open as a flyout?",
        options: ["Flyout", "Keep the modal"],
        recommendation: "Flyout",
      },
    },
    "Last summary.",
  );
  expect(comment).toContain(
    "**Decision needed:** Should History open as a flyout?",
  );
  expect(comment).toContain("1. Flyout\n2. Keep the modal");
  expect(comment).toContain("R4.F1 (major, restated 2x) `a.ts`: fix F1");
  expect(comment).toContain("Last summary.");
  expect(comment).toContain("remove `needs-owner`");
});
