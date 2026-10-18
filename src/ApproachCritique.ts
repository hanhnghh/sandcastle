import { z } from "zod";
import { extractStructuredOutput } from "./extractStructuredOutput.js";
import { Output } from "./Output.js";

/** Tag carrying the implementer's approach brief. */
export const APPROACH_PLAN_TAG = "approach-plan";
/** Tag carrying the advisor's critique. */
export const APPROACH_CRITIQUE_TAG = "approach-critique";

const text = (max: number) => z.string().min(1).max(max);

/** One concern raised by the advisor. */
export const approachConcernSchema = z
  .object({
    id: z.string().min(1).max(80),
    severity: z.enum(["critical", "major", "minor"]),
    /** What is wrong or risky in the approach. */
    point: text(2000),
    /** Concrete alternative direction. */
    suggestion: text(2000),
  })
  .strict();
export type ApproachConcern = z.infer<typeof approachConcernSchema>;

/** The implementer's decision on one concern, recorded in a revised brief. */
export const concernDispositionSchema = z
  .object({
    concern: z.string().min(1).max(80),
    decision: z.enum(["accepted", "disputed"]),
    /** Required: how it was applied, or why it is disputed. */
    reason: text(2000),
  })
  .strict();
export type ConcernDisposition = z.infer<typeof concernDispositionSchema>;

/** Short approach brief written before any code change. */
export const approachPlanSchema = z
  .object({
    goal: text(2000),
    /** Relative size; used for progress-checkpoint budgets. */
    size: z.enum(["S", "M", "L"]),
    estimate: z
      .object({
        minutes: z
          .number()
          .int()
          .min(1)
          .max(24 * 60),
        iterations: z.number().int().min(1).max(100),
      })
      .strict(),
    files: z.array(text(500)).max(100),
    steps: z.array(text(2000)).min(1).max(40),
    tests: z.array(text(2000)).max(40),
    risks: z.array(text(2000)).max(40),
    /** Present in a revised brief: one entry per concern of the previous critique. */
    dispositions: z.array(concernDispositionSchema).max(50).optional(),
  })
  .strict();
export type ApproachPlan = z.infer<typeof approachPlanSchema>;

/** The advisor's critique. */
export const approachCritiqueSchema = z
  .object({
    verdict: z.enum(["proceed", "revise", "escalate"]),
    summary: text(2000),
    concerns: z.array(approachConcernSchema).max(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.verdict === "revise" && value.concerns.length === 0)
      context.addIssue({
        code: "custom",
        path: ["concerns"],
        message: "revise requires at least one concern",
      });
    const ids = value.concerns.map((concern) => concern.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["concerns"],
        message: "concern ids must be unique",
      });
  });
export type ApproachCritique = z.infer<typeof approachCritiqueSchema>;

const ctx = { commits: [], branch: "" };
export const parseApproachPlan = (stdout: string) =>
  extractStructuredOutput<ApproachPlan>(
    stdout,
    Output.object({ tag: APPROACH_PLAN_TAG, schema: approachPlanSchema }),
    ctx,
  );
export const parseApproachCritique = (stdout: string) =>
  extractStructuredOutput<ApproachCritique>(
    stdout,
    Output.object({
      tag: APPROACH_CRITIQUE_TAG,
      schema: approachCritiqueSchema,
    }),
    ctx,
  );

/** Render a critique as implementer input (prompt argument). */
export const formatApproachCritique = (critique: ApproachCritique): string =>
  [
    `Verdict: ${critique.verdict}. ${critique.summary}`,
    ...critique.concerns.map(
      (concern) =>
        `- [${concern.id}] (${concern.severity}) ${concern.point} Suggestion: ${concern.suggestion}`,
    ),
  ].join("\n");

/** Render a brief as advisor input (prompt argument). */
export const formatApproachPlan = (plan: ApproachPlan): string =>
  JSON.stringify(plan, null, 2);

/** Minimal run shape the loop needs. */
export interface ApproachRun {
  readonly stdout: string;
  readonly commits: readonly { readonly sha: string }[];
}

/** Record of one plan/critique round. */
export interface ApproachRound {
  readonly round: number;
  readonly plan?: ApproachPlan;
  readonly critique?: ApproachCritique;
  readonly error?: string;
}

/** Per-run advisor invocation budget, shared by every issue. */
export interface AdvisorBudget {
  remaining: number;
}

export interface ApproachCritiqueOptions {
  /** Revise rounds after a `revise` verdict. Default 1. */
  readonly rounds?: number;
  /** Shared per-run cap on advisor invocations. */
  readonly budget?: AdvisorBudget;
  /**
   * Run the implementer in plan-only mode. `previous` is the critique to
   * answer (null on the first brief). Must not commit; the caller should also
   * verify the worktree stayed clean.
   */
  plan(round: number, previous: ApproachCritique | null): Promise<ApproachRun>;
  /** Run the advisor read-only on the brief. Must not commit. */
  critique(round: number, plan: ApproachPlan): Promise<ApproachRun>;
}

export interface ApproachCritiqueResult {
  /**
   * `proceed`: implement with `critique` as input. `escalate`: retain the
   * branch for the owner. `skipped`: the per-run advisor budget is spent;
   * implementation continues uncritiqued and this is recorded.
   */
  readonly outcome: "proceed" | "escalate" | "skipped";
  readonly reason?:
    | "advisor-escalated"
    | "unresolved-after-budget"
    | "invalid-plan"
    | "invalid-critique"
    | "missing-dispositions"
    | "plan-modified-repository"
    | "advisor-modified-repository"
    | "advisor-budget-spent";
  /** The brief to implement (last valid one). */
  readonly plan?: ApproachPlan;
  /** The critique to pass to the implementer (last valid one). */
  readonly critique?: ApproachCritique;
  readonly rounds: readonly ApproachRound[];
  /** Concern outcomes across rounds, for run evidence. */
  readonly counts: { accepted: number; disputed: number; escalated: boolean };
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Bounded approach critique before implementation. The implementer writes a
 * brief, the advisor critiques it; on `revise` the implementer answers every
 * concern (accepted or disputed with a reason) and the advisor re-checks, up
 * to `rounds`. Any malformed output, repository change or unresolved
 * disagreement after the budget escalates; nothing proceeds silently.
 */
export const runApproachCritique = async (
  options: ApproachCritiqueOptions,
): Promise<ApproachCritiqueResult> => {
  const rounds = options.rounds ?? 1;
  if (!Number.isInteger(rounds) || rounds < 0)
    throw new RangeError("rounds must be a non-negative integer");
  const history: ApproachRound[] = [];
  const counts = { accepted: 0, disputed: 0, escalated: false };
  const done = (
    outcome: ApproachCritiqueResult["outcome"],
    extra: Partial<ApproachCritiqueResult> = {},
  ): ApproachCritiqueResult => {
    if (outcome === "escalate") counts.escalated = true;
    return { outcome, rounds: history, counts, ...extra };
  };
  let previous: ApproachCritique | null = null;
  for (let round = 1; ; round++) {
    const planRun = await options.plan(round, previous);
    if (planRun.commits.length > 0) {
      history.push({ round, error: "plan run committed changes" });
      return done("escalate", { reason: "plan-modified-repository" });
    }
    let plan: ApproachPlan;
    try {
      plan = await parseApproachPlan(planRun.stdout);
    } catch (error) {
      history.push({ round, error: message(error) });
      return done("escalate", { reason: "invalid-plan" });
    }
    if (previous) {
      const answered = new Map(
        (plan.dispositions ?? []).map((d) => [d.concern, d.decision]),
      );
      if (previous.concerns.some((concern) => !answered.has(concern.id))) {
        history.push({
          round,
          plan,
          error: "revised brief did not answer every concern",
        });
        return done("escalate", { reason: "missing-dispositions", plan });
      }
      for (const decision of answered.values())
        if (decision === "accepted") counts.accepted++;
        else counts.disputed++;
    }
    if (options.budget && options.budget.remaining <= 0) {
      history.push({ round, plan });
      return done("skipped", { reason: "advisor-budget-spent", plan });
    }
    if (options.budget) options.budget.remaining--;
    const critiqueRun = await options.critique(round, plan);
    if (critiqueRun.commits.length > 0) {
      history.push({ round, plan, error: "advisor committed changes" });
      return done("escalate", { reason: "advisor-modified-repository", plan });
    }
    let critique: ApproachCritique;
    try {
      critique = await parseApproachCritique(critiqueRun.stdout);
    } catch (error) {
      history.push({ round, plan, error: message(error) });
      return done("escalate", { reason: "invalid-critique", plan });
    }
    history.push({ round, plan, critique });
    if (critique.verdict === "proceed")
      return done("proceed", { plan, critique });
    if (critique.verdict === "escalate")
      return done("escalate", { reason: "advisor-escalated", plan, critique });
    if (round > rounds)
      return done("escalate", {
        reason: "unresolved-after-budget",
        plan,
        critique,
      });
    previous = critique;
  }
};

/** Critique summary attached to an advisor run for Agent Map. */
export interface ApproachRunEvidence {
  readonly verdict: ApproachCritique["verdict"] | "invalid";
  readonly summary?: string;
  readonly concerns: readonly ApproachConcern[];
  readonly error?: string;
}

/** Attach the parsed critique to an advisor run as `approach`. Never throws. */
export const withApproachCritique = async <R extends ApproachRun>(
  run: R | Promise<R>,
): Promise<R & { approach: ApproachRunEvidence }> => {
  const value = await run;
  try {
    const critique = await parseApproachCritique(value.stdout);
    return {
      ...value,
      approach: {
        verdict: critique.verdict,
        summary: critique.summary,
        concerns: critique.concerns,
      },
    };
  } catch (error) {
    return {
      ...value,
      approach: { verdict: "invalid", concerns: [], error: message(error) },
    };
  }
};
