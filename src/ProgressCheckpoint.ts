import { z } from "zod";
import type { AdvisorBudget, ApproachPlan } from "./ApproachCritique.js";
import { extractStructuredOutput } from "./extractStructuredOutput.js";
import { Output } from "./Output.js";

/** Tag carrying the advisor's progress check. */
export const PROGRESS_CHECK_TAG = "progress-check";

export const progressCheckSchema = z
  .object({
    verdict: z.enum(["continue", "redirect", "stop"]),
    /** How the work compares with the approach so far. */
    assessment: z.string().min(1).max(4000),
    /** What to do next; required for `redirect`. */
    direction: z.string().max(4000),
    /** Minutes the advisor expects the remaining work to take. */
    remainingBudget: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.verdict === "redirect" && !value.direction.trim())
      context.addIssue({
        code: "custom",
        path: ["direction"],
        message: "redirect requires a direction",
      });
  });
export type ProgressCheck = z.infer<typeof progressCheckSchema>;

export const parseProgressCheck = (stdout: string) =>
  extractStructuredOutput<ProgressCheck>(
    stdout,
    Output.object({ tag: PROGRESS_CHECK_TAG, schema: progressCheckSchema }),
    { commits: [], branch: "" },
  );

/** Render a progress check as implementer input. */
export const formatProgressCheck = (check: ProgressCheck): string =>
  [
    `Verdict: ${check.verdict}. ${check.assessment}`,
    ...(check.direction.trim() ? [`Direction: ${check.direction}`] : []),
    `Remaining budget: ${check.remainingBudget} minutes.`,
  ].join("\n");

export type CheckpointSize = ApproachPlan["size"];

/** Default estimate for an issue label, used when there is no approach brief. */
export interface CheckpointDefault {
  readonly minutes: number;
  readonly size?: CheckpointSize;
}

/** `workflow.json` `advisor.checkpoint`. */
export interface CheckpointPolicy {
  readonly mode: "off" | "on";
  readonly factor?: number;
  readonly max?: number;
  readonly repeatThreshold?: number;
  readonly defaults?: Readonly<Record<string, CheckpointDefault>>;
  /** Globs of files the drift signals skip, such as required evidence. */
  readonly ignore?: readonly string[];
}

const fallbackDefault: Required<CheckpointDefault> = { minutes: 30, size: "M" };

export interface CheckpointBudget {
  readonly estimateMinutes: number;
  /** Estimate × factor; time checkpoints fire at fractions of this. */
  readonly budgetMinutes: number;
  readonly size: CheckpointSize;
  /** `brief`, `label:<name>` or `default`. */
  readonly source: string;
}

/**
 * Budget for one implementation: the approach brief's estimate when there is
 * one, else the first matching per-label default, else the `*` default (or
 * 30 minutes, size M), multiplied by `factor` (default 1.5).
 */
export const checkpointBudget = (options: {
  readonly plan?: ApproachPlan;
  readonly labels?: readonly string[];
  readonly defaults?: Readonly<Record<string, CheckpointDefault>>;
  readonly factor?: number;
}): CheckpointBudget => {
  const factor = options.factor ?? 1.5;
  if (!(factor >= 1 && factor <= 10))
    throw new RangeError("factor must be between 1 and 10");
  const defaults = options.defaults ?? {};
  let estimate: Required<CheckpointDefault>;
  let source: string;
  if (options.plan) {
    estimate = {
      minutes: options.plan.estimate.minutes,
      size: options.plan.size,
    };
    source = "brief";
  } else {
    const label = (options.labels ?? []).find((name) => defaults[name]);
    const chosen = label ? defaults[label]! : defaults["*"];
    estimate = { ...fallbackDefault, ...chosen };
    source = label ? `label:${label}` : "default";
  }
  return {
    estimateMinutes: estimate.minutes,
    budgetMinutes: estimate.minutes * factor,
    size: estimate.size,
    source,
  };
};

/** Changed lines above which the diff counts as far above the estimate. */
export const diffLineLimit = (size: CheckpointSize, factor = 1.5): number =>
  Math.round({ S: 300, M: 1000, L: 3000 }[size] * factor);

export type CheckpointSignalKind =
  | "time"
  | "outside-brief"
  | "repeated-error"
  | "churn"
  | "diff-size";

/** Why a checkpoint fired. */
export interface CheckpointSignal {
  readonly kind: CheckpointSignalKind;
  readonly detail: string;
}

/** Implementer state sampled while it runs. */
export interface ProgressSnapshot {
  /** Changed files against the base, committed or not, with changed lines. */
  readonly files: readonly { readonly path: string; readonly lines: number }[];
  /** Implementer output so far (cumulative). */
  readonly log: string;
}

export interface DriftDetector {
  /** Record a snapshot; returns a signal when it shows new drift evidence. */
  observe(snapshot: ProgressSnapshot): CheckpointSignal | undefined;
}

// Error-shaped output only: thrown errors, compiler and test-runner failures,
// non-zero exits. Words like "error" inside quoted code do not count.
const errorLine = new RegExp(
  [
    String.raw`\b(?:[A-Z]\w*)?(?:Error|Exception)\b(?::|$)`,
    String.raw`\berror TS\d+`,
    String.raw`^\s*(?:FAIL|FAILED|ERROR|ERR!)\b`,
    String.raw`^\s*[✗✘×]\s`,
    String.raw`^\s*error(?:\[\w+\])?:`,
    String.raw`npm ERR!`,
    String.raw`\b\d+ (?:failed|failing)\b`,
    String.raw`\b(?:exit(?:ed)? (?:with )?code|exit status) [1-9]`,
    String.raw`\bCommand failed\b`,
  ].join("|"),
);
/**
 * Test-runner tallies ("1 failed", "Tests  2 failed | 10 passed",
 * "Failed Tests 3"). They repeat on every run that still has a failing test,
 * so they say nothing about whether the same error recurs; the error lines
 * under them do.
 */
const testSummaryLine = new RegExp(
  [
    String.raw`^[\s⎯─-]*Failed Tests \d+[\s⎯─-]*$`,
    String.raw`^\s*(?:Tests?|Test Files|Test Suites)?:?\s*(?:\d+\s+(?:failed|failing|passed|flaky|skipped|pending|todo|total|did not run|interrupted)(?:\s*\([^)]*\))?[\s,|]*)+$`,
  ].join("|"),
  "i",
);
const normalizeError = (line: string) =>
  line
    .toLowerCase()
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

const inBrief = (path: string, files: readonly string[]) =>
  files.some((entry) => {
    const prefix = entry.trim().replace(/^\.\//, "").replace(/\/$/, "");
    return prefix && (path === prefix || path.startsWith(`${prefix}/`));
  });

/**
 * Detect drift between snapshots. Each signal fires once per piece of new
 * evidence: a file outside the brief is reported once, an error must repeat
 * `repeatThreshold` more times, churn needs new edit–revert cycles, and the
 * diff limit doubles after each report.
 */
export const createDriftDetector = (options: {
  /** Files from the approach brief; without them the signal is off. */
  readonly briefFiles?: readonly string[];
  readonly repeatThreshold?: number;
  readonly diffLimit: number;
  /** Edit–revert cycles on one file before churn fires. Default 2. */
  readonly churnCycles?: number;
  /** Globs (`*`, `**`) of files every signal skips, such as required evidence. */
  readonly ignore?: readonly string[];
}): DriftDetector => {
  const ignored = globMatcher(options.ignore ?? []);
  const repeatThreshold = options.repeatThreshold ?? 3;
  const churnCycles = options.churnCycles ?? 2;
  const minChurnLines = 10;
  const briefFiles = options.briefFiles ?? [];
  const reported = new Set<string>();
  const errors = new Map<string, number>();
  const churn = new Map<
    string,
    { peak: number; low: boolean; cycles: number }
  >();
  let logOffset = 0;
  let diffReports = 0;
  return {
    observe(snapshot) {
      const signals: CheckpointSignal[] = [];
      const files = snapshot.files.filter((file) => !ignored(file.path));
      const outside = files
        .map((file) => file.path)
        .filter((path) => !reported.has(path) && briefFiles.length > 0)
        .filter((path) => !inBrief(path, briefFiles));
      if (outside.length > 0) {
        for (const path of outside) reported.add(path);
        signals.push({
          kind: "outside-brief",
          detail: `Changed outside the approach brief: ${outside.slice(0, 20).join(", ")}`,
        });
      }

      if (snapshot.log.length < logOffset) logOffset = 0;
      const fresh = snapshot.log.slice(logOffset);
      // Only whole lines; the last partial line is read next time.
      const end = fresh.lastIndexOf("\n") + 1;
      logOffset += end;
      for (const line of fresh.slice(0, end).split("\n")) {
        if (line.trim().length < 8 || !errorLine.test(line)) continue;
        if (testSummaryLine.test(line)) continue;
        const key = normalizeError(line);
        const count = (errors.get(key) ?? 0) + 1;
        errors.set(key, count);
        if (count >= repeatThreshold) {
          errors.set(key, 0);
          signals.push({
            kind: "repeated-error",
            detail: `Same error ${count} times: ${line.trim().slice(0, 300)}`,
          });
        }
      }

      const lines = new Map(files.map((f) => [f.path, f.lines]));
      for (const path of new Set([...churn.keys(), ...lines.keys()])) {
        const current = lines.get(path) ?? 0;
        const state = churn.get(path) ?? { peak: 0, low: false, cycles: 0 };
        churn.set(path, state);
        if (state.low) {
          if (current >= state.peak * 0.8) {
            state.cycles++;
            state.low = false;
          }
        } else if (state.peak >= minChurnLines && current <= state.peak * 0.5)
          state.low = true;
        if (!state.low) state.peak = Math.max(state.peak, current);
        if (state.cycles >= churnCycles) {
          state.cycles = 0;
          signals.push({
            kind: "churn",
            detail: `Repeated edit and revert of ${path}`,
          });
        }
      }

      const total = files.reduce((sum, f) => sum + f.lines, 0);
      if (total > options.diffLimit * 2 ** diffReports) {
        diffReports++;
        signals.push({
          kind: "diff-size",
          detail: `${total} changed lines; the estimate allows about ${options.diffLimit}`,
        });
      }
      return signals[0];
    },
  };
};

// Stream events and items written by the agent (Claude stream-json, Codex
// exec --json), and keys that carry tool input such as code being written.
const agentAuthored = new Set([
  "assistant",
  "result",
  "system",
  "tool_use",
  "thinking",
  "agent_message",
  "reasoning",
  "file_change",
  "todo_list",
]);
const toolInputKeys = new Set([
  "input",
  "command",
  "arguments",
  "args",
  "patch",
  "changes",
]);

/**
 * Error lines in one raw agent stream line (provider JSON or plain text),
 * each reported once per line so a test summary repeating an error does not
 * count twice. Only tool results and command output count, never the agent's
 * narration or tool input. Feed them to the detector's `log`.
 */
export const errorLinesOf = (raw: string): string[] => {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      // The agent's own words and tool inputs are not command output.
      if (typeof record.type === "string" && agentAuthored.has(record.type))
        return;
      for (const [key, child] of Object.entries(record))
        if (!toolInputKeys.has(key)) walk(child);
    }
  };
  try {
    walk(JSON.parse(raw));
  } catch {
    strings.push(raw);
  }
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of strings.flatMap((text) => text.split("\n"))) {
    if (line.trim().length < 8 || !errorLine.test(line)) continue;
    if (testSummaryLine.test(line)) continue;
    const key = normalizeError(line);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line.trim().slice(0, 500));
  }
  return lines;
};

/**
 * Match repository paths against globs: `**` spans directories, `*` stays
 * within one path segment, everything else is literal.
 */
export const globMatcher = (globs: readonly string[]) => {
  const patterns = globs.map(
    (glob) =>
      new RegExp(
        `^${glob
          .split("**")
          .map((part) =>
            part
              .split("*")
              .map((text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
              .join("[^/]*"),
          )
          .join(".*")}$`,
      ),
  );
  return (path: string) => patterns.some((pattern) => pattern.test(path));
};

/** Parse `git diff --numstat` output (plus untracked files as `N\t0\tpath`). */
export const parseNumstat = (output: string): ProgressSnapshot["files"] =>
  output
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 3 && parts[2]!.trim())
    .map(([added, deleted, ...path]) => ({
      path: path.join("\t").trim(),
      lines:
        (Number.parseInt(added!, 10) || 0) +
        (Number.parseInt(deleted!, 10) || 0),
    }));

/** Minimal run shape the checkpoint loop needs. */
export interface CheckpointRun {
  readonly stdout: string;
  readonly commits: readonly { readonly sha: string }[];
  readonly paused?: boolean;
}

/** One running implementer segment that can be paused. */
export interface CheckpointSegment<R extends CheckpointRun> {
  readonly result: Promise<R>;
  /** Pause the implementer; `result` then resolves with `paused: true`. */
  pause(): void;
}

export interface CheckpointRecord {
  readonly checkpoint: number;
  readonly signal: CheckpointSignal;
  readonly elapsedMinutes: number;
  readonly check?: ProgressCheck;
  readonly error?: string;
  /** How the implementer continued: its own session, or a fresh attempt. */
  readonly resumed?: "session" | "fresh";
  /** Set when the advisor budget was spent and the checkpoint was skipped. */
  readonly skipped?: "advisor-budget-spent";
}

export interface ProgressCheckpointOptions<R extends CheckpointRun> {
  readonly budgetMinutes: number;
  /** Fractions of the budget at which time checkpoints fire. Default [0.5, 1]. */
  readonly fractions?: readonly number[];
  /** Checkpoints allowed per implementation (0–10). Default 2. */
  readonly max?: number;
  /** Sampling interval in milliseconds. Default 30 000. */
  readonly pollMs?: number;
  /** Length of a budget minute in milliseconds (tests shorten it). Default 60 000. */
  readonly minuteMs?: number;
  /** Shared per-run advisor invocation cap. */
  readonly budget?: AdvisorBudget;
  readonly detector?: DriftDetector;
  /** Start the implementer. */
  start(): CheckpointSegment<R>;
  /** Sample the implementer's state for drift detection. */
  snapshot?(): Promise<ProgressSnapshot>;
  /** Run the advisor read-only on the paused implementer. Must not commit. */
  check(
    checkpoint: number,
    signal: CheckpointSignal,
    progress: {
      readonly elapsedMinutes: number;
      readonly budgetMinutes: number;
    },
  ): Promise<{
    readonly stdout: string;
    readonly commits: readonly { readonly sha: string }[];
  }>;
  /**
   * Continue the paused implementer with the advisor's check: resume its
   * session when the provider can, else start a fresh attempt on the same
   * worktree. `mode` records which.
   */
  resume(
    paused: R,
    check: ProgressCheck,
    checkpoint: number,
  ): { segment: CheckpointSegment<R>; mode: "session" | "fresh" };
}

export interface ProgressCheckpointResult<R extends CheckpointRun> {
  /**
   * `completed`: the implementer finished on its own (inspect `result`).
   * `stopped`: the advisor said stop. `invalid-check`: malformed check or an
   * advisor that changed the repository. `cap-reached`: a checkpoint fired
   * after `max` checkpoints. Every outcome but `completed` retains the branch.
   */
  readonly outcome: "completed" | "stopped" | "invalid-check" | "cap-reached";
  /** The last segment's result. */
  readonly result: R;
  /** Commits and output across every segment. */
  readonly commits: readonly { readonly sha: string }[];
  readonly stdout: string;
  readonly checkpoints: readonly CheckpointRecord[];
  readonly budgetMinutes: number;
  /** Implementer running time, excluding time spent paused. */
  readonly elapsedMinutes: number;
  readonly error?: string;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const round = (minutes: number) => Math.round(minutes * 10) / 10;

/**
 * Run an implementer under progress checkpoints. Time checkpoints fire at
 * fractions of the budget (then after the advisor's remaining budget) and
 * drift signals fire early. At each one the implementer is paused, the
 * advisor checks progress read-only, and the implementer continues with the
 * check, or the run ends with the branch retained.
 */
export const runWithCheckpoints = async <R extends CheckpointRun>(
  options: ProgressCheckpointOptions<R>,
): Promise<ProgressCheckpointResult<R>> => {
  const max = options.max ?? 2;
  if (!Number.isInteger(max) || max < 0 || max > 10)
    throw new RangeError("max must be an integer between 0 and 10");
  const pollMs = options.pollMs ?? 30_000;
  const minuteMs = options.minuteMs ?? 60_000;
  const schedule = [...(options.fractions ?? [0.5, 1])]
    .map((fraction) => fraction * options.budgetMinutes)
    .sort((a, b) => a - b);
  const started = Date.now();
  let pausedMs = 0;
  const elapsed = () => (Date.now() - started - pausedMs) / minuteMs;
  let next = 0;
  let extraDeadline: number | undefined;
  let budgetSpent = false;
  const checkpoints: CheckpointRecord[] = [];
  const commits: { sha: string }[] = [];
  let stdout = "";
  const collect = (run: R) => {
    commits.push(...run.commits);
    stdout += run.stdout;
  };
  const done = (
    outcome: ProgressCheckpointResult<R>["outcome"],
    result: R,
    error?: string,
  ): ProgressCheckpointResult<R> => ({
    outcome,
    result,
    commits,
    stdout,
    checkpoints,
    budgetMinutes: options.budgetMinutes,
    elapsedMinutes: round(elapsed()),
    ...(error ? { error } : {}),
  });

  let segment = options.start();
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      segment.result.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      ),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), pollMs);
      }),
    ]);
    clearTimeout(timer);
    if (settled) {
      if ("error" in settled) throw settled.error;
      collect(settled.value);
      return done("completed", settled.value);
    }
    if (budgetSpent) continue;

    let signal: CheckpointSignal | undefined;
    const minutes = elapsed();
    const deadline = next < schedule.length ? schedule[next] : extraDeadline;
    if (deadline !== undefined && minutes >= deadline) {
      if (next < schedule.length) next++;
      else extraDeadline = undefined;
      signal = {
        kind: "time",
        detail: `${Math.round(minutes)} of ${Math.round(options.budgetMinutes)} budgeted minutes used`,
      };
    } else if (options.snapshot && options.detector) {
      try {
        signal = options.detector.observe(await options.snapshot());
      } catch {
        // A failed sample is not evidence; try again next interval.
      }
    }
    if (!signal) continue;
    if (options.budget && options.budget.remaining <= 0) {
      budgetSpent = true;
      checkpoints.push({
        checkpoint: checkpoints.length + 1,
        signal,
        elapsedMinutes: round(minutes),
        skipped: "advisor-budget-spent",
      });
      continue;
    }

    const pauseStarted = Date.now();
    segment.pause();
    const paused = await segment.result;
    collect(paused);
    // Finished on its own while being paused.
    if (!paused.paused) return done("completed", paused);
    const held = checkpoints.filter((c) => !c.skipped).length;
    if (held >= max) {
      checkpoints.push({
        checkpoint: checkpoints.length + 1,
        signal,
        elapsedMinutes: round(minutes),
      });
      return done(
        "cap-reached",
        paused,
        `checkpoint limit ${max} reached (${signal.kind}: ${signal.detail})`,
      );
    }
    if (options.budget) options.budget.remaining--;
    const number = checkpoints.length + 1;
    const run = await options.check(number, signal, {
      elapsedMinutes: round(minutes),
      budgetMinutes: options.budgetMinutes,
    });
    if (run.commits.length > 0) {
      checkpoints.push({
        checkpoint: number,
        signal,
        elapsedMinutes: round(minutes),
        error: "advisor changed the repository",
      });
      return done("invalid-check", paused, "advisor changed the repository");
    }
    let check: ProgressCheck;
    try {
      check = await parseProgressCheck(run.stdout);
    } catch (error) {
      checkpoints.push({
        checkpoint: number,
        signal,
        elapsedMinutes: round(minutes),
        error: message(error),
      });
      return done("invalid-check", paused, message(error));
    }
    if (check.verdict === "stop") {
      checkpoints.push({
        checkpoint: number,
        signal,
        elapsedMinutes: round(minutes),
        check,
      });
      return done("stopped", paused);
    }
    if (next >= schedule.length)
      extraDeadline = minutes + Math.max(1, check.remainingBudget);
    pausedMs += Date.now() - pauseStarted;
    const continued = options.resume(paused, check, number);
    checkpoints.push({
      checkpoint: number,
      signal,
      elapsedMinutes: round(minutes),
      check,
      resumed: continued.mode,
    });
    segment = continued.segment;
  }
};

/** Progress-check summary attached to an advisor run for Agent Map. */
export interface ProgressCheckEvidence {
  readonly verdict: ProgressCheck["verdict"] | "invalid";
  readonly signal: CheckpointSignalKind;
  readonly signalDetail: string;
  readonly assessment?: string;
  readonly direction?: string;
  readonly remainingBudget?: number;
  readonly error?: string;
}

/** Attach the parsed check to an advisor run as `checkpoint`. Never throws. */
export const withProgressCheck = async <R extends { readonly stdout: string }>(
  run: R | Promise<R>,
  signal: CheckpointSignal,
): Promise<R & { checkpoint: ProgressCheckEvidence }> => {
  const value = await run;
  const base = { signal: signal.kind, signalDetail: signal.detail };
  try {
    const check = await parseProgressCheck(value.stdout);
    return {
      ...value,
      checkpoint: {
        ...base,
        verdict: check.verdict,
        assessment: check.assessment,
        direction: check.direction,
        remainingBudget: check.remainingBudget,
      },
    };
  } catch (error) {
    return {
      ...value,
      checkpoint: { ...base, verdict: "invalid", error: message(error) },
    };
  }
};
