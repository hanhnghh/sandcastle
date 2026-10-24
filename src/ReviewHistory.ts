import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ReviewDecision,
  ReviewFinding,
  ReviewRound,
} from "./ReviewLoop.js";

/**
 * Review rounds of one issue across every attempt and run. The review loop's
 * repair budget restarts whenever a retained branch is planned again; this
 * history does not, so a task that keeps failing review reaches the owner.
 */
export interface IssueReviewHistory {
  readonly rounds: readonly ReviewHistoryRound[];
  /** Number of rounds recorded when the issue was last handed to the owner. */
  readonly escalatedAfter?: number;
}

/** One recorded review round; `round` counts every round of the issue. */
export interface ReviewHistoryRound {
  readonly round: number;
  readonly verdict: ReviewRound["verdict"];
  readonly findings: readonly ReviewFinding[];
  readonly decision?: ReviewDecision;
  readonly at: string;
}

export interface ReviewRoundPolicy {
  /** Open round from which the reviewer sweeps whole classes of defects. 0 disables. */
  readonly sweepFrom: number;
  /** Open rounds after which the issue goes to the owner. 0 disables. */
  readonly roundCap: number;
  /** Times one unresolved finding may be restated before the owner decides. 0 disables. */
  readonly repeatLimit: number;
}

export interface ReviewEscalation {
  readonly reason: "repeated-finding" | "round-cap";
  /** Open rounds counted when escalating. */
  readonly openRounds: number;
  /** Major or critical findings of the last round, with how often each was restated. */
  readonly findings: readonly {
    readonly key: string;
    readonly finding: ReviewFinding;
    readonly restated: number;
  }[];
  readonly decision?: ReviewDecision;
}

/** Key that later rounds use to point at a finding, for example `R3.F1`. */
export const reviewFindingKey = (round: number, id: string) =>
  `R${round}.${id}`;

/** Rounds recorded since the owner last took the issue. */
export const openReviewRounds = (
  history: IssueReviewHistory,
): readonly ReviewHistoryRound[] =>
  history.rounds.slice(history.escalatedAfter ?? 0);

/** Whether the next review round (open rounds so far plus one) is a sweep. */
export const isSweepRound = (openRound: number, policy: ReviewRoundPolicy) =>
  policy.sweepFrom > 0 && openRound >= policy.sweepFrom;

/** Earlier unresolved findings as reviewer prompt input; `None.` when there are none. */
export const formatPreviousFindings = (history: IssueReviewHistory): string => {
  const rounds = openReviewRounds(history).filter(
    (round) => round.verdict === "changes-requested",
  );
  if (rounds.length === 0) return "None.";
  return rounds
    .flatMap((round) =>
      round.findings.map(
        (finding) =>
          `- [${reviewFindingKey(round.round, finding.id)}] (${finding.severity})${finding.file ? ` ${finding.file}` : ""}: ${finding.change}`,
      ),
    )
    .join("\n");
};

/** How many times a finding restates earlier ones, following `repeats` links. */
const restatedCount = (
  rounds: readonly ReviewHistoryRound[],
  finding: ReviewFinding,
): number => {
  const byKey = new Map(
    rounds.flatMap((round) =>
      round.findings.map(
        (earlier) =>
          [reviewFindingKey(round.round, earlier.id), earlier] as const,
      ),
    ),
  );
  let count = 0;
  const seen = new Set<string>();
  for (
    let key = finding.repeats;
    key !== undefined && !seen.has(key);
    key = byKey.get(key)?.repeats
  ) {
    seen.add(key);
    if (!byKey.has(key)) break;
    count++;
  }
  return count;
};

/**
 * Decide whether the last recorded round hands the issue to the owner: a major
 * or critical finding restated `repeatLimit` times, or `roundCap` open rounds
 * without approval. Only a `changes-requested` round escalates.
 */
export const reviewEscalation = (
  history: IssueReviewHistory,
  policy: ReviewRoundPolicy,
): ReviewEscalation | undefined => {
  const rounds = openReviewRounds(history);
  const last = rounds.at(-1);
  if (!last || last.verdict !== "changes-requested") return undefined;
  const findings = last.findings
    .filter((finding) => finding.severity !== "minor")
    .map((finding) => ({
      key: reviewFindingKey(last.round, finding.id),
      finding,
      restated: restatedCount(rounds, finding),
    }));
  const decision =
    last.decision === undefined ? {} : { decision: last.decision };
  if (
    policy.repeatLimit > 0 &&
    findings.some((entry) => entry.restated >= policy.repeatLimit)
  )
    return {
      reason: "repeated-finding",
      openRounds: rounds.length,
      findings: findings.filter(
        (entry) => entry.restated >= policy.repeatLimit,
      ),
      ...decision,
    };
  if (policy.roundCap > 0 && rounds.length >= policy.roundCap)
    return {
      reason: "round-cap",
      openRounds: rounds.length,
      findings,
      ...decision,
    };
  return undefined;
};

/** Issue comment handing an escalated review to the owner. */
export const reviewEscalationComment = (
  escalation: ReviewEscalation,
  summary?: string,
): string => {
  const lines = [
    escalation.reason === "repeated-finding"
      ? `Sandcastle review stopped: a finding was restated in ${escalation.openRounds} review round(s) without being resolved, so implementer and reviewer disagree on what the task requires.`
      : `Sandcastle review stopped after ${escalation.openRounds} review rounds without approval.`,
    "",
  ];
  if (escalation.decision) {
    lines.push(`**Decision needed:** ${escalation.decision.question}`, "");
    escalation.decision.options.forEach((option, index) =>
      lines.push(`${index + 1}. ${option}`),
    );
    if (escalation.decision.recommendation)
      lines.push(
        "",
        `Reviewer recommends: ${escalation.decision.recommendation}`,
      );
    lines.push("");
  }
  if (escalation.findings.length > 0) {
    lines.push("**Open findings**", "");
    for (const { key, finding, restated } of escalation.findings)
      lines.push(
        `- ${key} (${finding.severity}${restated > 0 ? `, restated ${restated}x` : ""})${finding.file ? ` \`${finding.file}\`` : ""}: ${finding.change}`,
      );
    lines.push("");
  }
  if (summary) lines.push("**Last review**", "", summary, "");
  lines.push(
    "The branch is retained and the issue stays open. Reply with the decision (or amend the issue, or split it), then remove `needs-owner`; the next review starts a new round count.",
  );
  return lines.join("\n");
};

/** File-backed review history keyed by issue id. Writes are atomic. */
export const reviewHistoryStore = (file: string) => {
  const readAll = (): Record<string, IssueReviewHistory> => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        IssueReviewHistory
      >;
    } catch {
      return {};
    }
  };
  const write = (all: Record<string, IssueReviewHistory>) => {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(all, null, 2)}\n`);
    renameSync(temporary, file);
  };
  const read = (issue: string): IssueReviewHistory =>
    readAll()[issue] ?? { rounds: [] };
  return {
    read,
    /** Record a verdict as the issue's next round; returns the updated history. */
    record(issue: string, round: ReviewRound, at = new Date()) {
      const all = readAll();
      const current = all[issue] ?? { rounds: [] };
      const next: IssueReviewHistory = {
        ...current,
        rounds: [
          ...current.rounds,
          {
            round: current.rounds.length + 1,
            verdict: round.verdict,
            findings: round.findings,
            ...(round.decision === undefined
              ? {}
              : { decision: round.decision }),
            at: at.toISOString(),
          },
        ],
      };
      write({ ...all, [issue]: next });
      return next;
    },
    /** Start a new open-round count after handing the issue to the owner. */
    markEscalated(issue: string) {
      const all = readAll();
      const current = all[issue] ?? { rounds: [] };
      write({
        ...all,
        [issue]: { ...current, escalatedAfter: current.rounds.length },
      });
    },
  };
};
