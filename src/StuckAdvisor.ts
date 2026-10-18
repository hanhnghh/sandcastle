import { z } from "zod";
import type { AdvisorBudget } from "./ApproachCritique.js";
import { extractStructuredOutput } from "./extractStructuredOutput.js";
import { Output } from "./Output.js";

/** Tag carrying the advisor's diagnosis of a stalled implementation. */
export const STUCK_ADVICE_TAG = "stuck-advice";

/** Why the implementation stalled, as judged by the advisor. */
export const stuckCauses = [
  "misunderstood-task",
  "wrong-approach",
  "environment",
  "missing-dependency",
  "flaky",
  "unknown",
] as const;
export type StuckCause = (typeof stuckCauses)[number];

/** Causes an extra implementer attempt cannot fix; they go to the owner. */
const ownerCauses: readonly StuckCause[] = [
  "environment",
  "missing-dependency",
];

export const stuckAdviceSchema = z
  .object({
    diagnosis: z.string().min(1).max(4000),
    cause: z.enum(stuckCauses),
    nextSteps: z.array(z.string().min(1).max(2000)).min(1).max(20),
    confidence: z.enum(["low", "medium", "high"]),
    /** True when the advisor judges another attempt pointless or unsafe. */
    escalate: z.boolean(),
  })
  .strict();
export type StuckAdvice = z.infer<typeof stuckAdviceSchema>;

export const parseStuckAdvice = (stdout: string) =>
  extractStructuredOutput<StuckAdvice>(
    stdout,
    Output.object({ tag: STUCK_ADVICE_TAG, schema: stuckAdviceSchema }),
    { commits: [], branch: "" },
  );

/** Render advice as implementer input and as the owner-facing diagnosis. */
export const formatStuckAdvice = (advice: StuckAdvice): string =>
  [
    `Diagnosis (${advice.cause}, confidence ${advice.confidence}): ${advice.diagnosis}`,
    ...advice.nextSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");

/** What made the pipeline consult the advisor. */
export type StuckTrigger =
  | "implementation-incomplete"
  | "idle-timeout"
  | "review-budget-exhausted";

export interface StuckRun {
  readonly stdout: string;
  readonly commits: readonly { readonly sha: string }[];
}

export interface StuckAdvisorOptions<T> {
  readonly trigger: StuckTrigger;
  /** Extra implementer attempts guided by advice (0–2). Default 1. */
  readonly attempts?: number;
  /** Shared per-run advisor invocation cap (same budget as approach critique). */
  readonly budget?: AdvisorBudget;
  /** Run the advisor read-only for advised attempt `n` (one-based). Must not commit. */
  advise(attempt: number): Promise<StuckRun>;
  /** Run one advised implementer attempt; `resolved` true when it unblocked the pipeline. */
  retry(
    advice: StuckAdvice,
    attempt: number,
  ): Promise<{ resolved: boolean; value: T }>;
}

export interface StuckAdvisorResult<T> {
  /**
   * `resolved`: an advised attempt unblocked the pipeline (see `value`).
   * `failed-again`: advised attempts were spent without success.
   * `escalated`: the advisor asked for the owner, or the cause needs the owner.
   * `invalid-advice`: malformed advice or an advisor that changed the repository.
   * `skipped`: no attempts configured or the per-run budget is spent.
   */
  readonly outcome:
    | "resolved"
    | "failed-again"
    | "escalated"
    | "invalid-advice"
    | "skipped";
  readonly trigger: StuckTrigger;
  /** The last valid advice; its diagnosis goes to the owner on any non-resolved outcome. */
  readonly advice?: StuckAdvice;
  readonly value?: T;
  readonly error?: string;
  /** Advised attempts actually run. */
  readonly attempts: number;
}

/**
 * Consult the advisor when an implementation stalls and give the implementer
 * a bounded number of advised attempts. Environment and missing-dependency
 * causes, and advice that asks to escalate, never trigger another attempt.
 */
export const adviseWhenStuck = async <T>(
  options: StuckAdvisorOptions<T>,
): Promise<StuckAdvisorResult<T>> => {
  const attempts = options.attempts ?? 1;
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 2)
    throw new RangeError("attempts must be an integer between 0 and 2");
  const base = { trigger: options.trigger };
  let advice: StuckAdvice | undefined;
  let value: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (options.budget && options.budget.remaining <= 0)
      return {
        ...base,
        outcome: advice ? "failed-again" : "skipped",
        advice,
        value,
        attempts: attempt - 1,
      };
    if (options.budget) options.budget.remaining--;
    const run = await options.advise(attempt);
    if (run.commits.length > 0)
      return {
        ...base,
        outcome: "invalid-advice",
        advice,
        error: "advisor changed the repository",
        attempts: attempt - 1,
      };
    try {
      advice = await parseStuckAdvice(run.stdout);
    } catch (error) {
      return {
        ...base,
        outcome: "invalid-advice",
        advice,
        error: error instanceof Error ? error.message : String(error),
        attempts: attempt - 1,
      };
    }
    if (advice.escalate || ownerCauses.includes(advice.cause))
      return { ...base, outcome: "escalated", advice, attempts: attempt - 1 };
    const result = await options.retry(advice, attempt);
    value = result.value;
    if (result.resolved)
      return { ...base, outcome: "resolved", advice, value, attempts: attempt };
  }
  return {
    ...base,
    outcome: advice ? "failed-again" : "skipped",
    advice,
    value,
    attempts,
  };
};

/** Advice summary attached to an advisor run for Agent Map. */
export interface StuckAdviceEvidence {
  readonly cause: StuckCause | "invalid";
  readonly diagnosis?: string;
  readonly confidence?: StuckAdvice["confidence"];
  readonly escalate?: boolean;
  readonly nextSteps: readonly string[];
  readonly error?: string;
}

/** Attach parsed advice to an advisor run as `advice`. Never throws. */
export const withStuckAdvice = async <R extends StuckRun>(
  run: R | Promise<R>,
): Promise<R & { advice: StuckAdviceEvidence }> => {
  const value = await run;
  try {
    const advice = await parseStuckAdvice(value.stdout);
    return {
      ...value,
      advice: {
        cause: advice.cause,
        diagnosis: advice.diagnosis,
        confidence: advice.confidence,
        escalate: advice.escalate,
        nextSteps: advice.nextSteps,
      },
    };
  } catch (error) {
    return {
      ...value,
      advice: {
        cause: "invalid",
        nextSteps: [],
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
};
