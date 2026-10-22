import { describe, expect, it } from "vitest";
import type { ApproachPlan } from "./ApproachCritique.js";
import {
  checkpointBudget,
  createDriftDetector,
  diffLineLimit,
  errorLinesOf,
  parseNumstat,
  runWithCheckpoints,
  withProgressCheck,
  type CheckpointRun,
  type CheckpointSegment,
  type ProgressCheck,
} from "./ProgressCheckpoint.js";

const plan: ApproachPlan = {
  goal: "Add the endpoint",
  size: "S",
  estimate: { minutes: 20, iterations: 3 },
  files: ["src/api/", "src/api.test.ts"],
  steps: ["write the handler"],
  tests: ["api test"],
  risks: [],
};

const check = (value: Partial<ProgressCheck> = {}) =>
  `<progress-check>${JSON.stringify({
    verdict: "continue",
    assessment: "On track.",
    direction: "",
    remainingBudget: 10,
    ...value,
  })}</progress-check>`;

type Run = CheckpointRun & { readonly label: string };

/** A segment that runs until paused or until `finish` is called. */
const segment = (label: string) => {
  let resolve!: (run: Run) => void;
  const result = new Promise<Run>((r) => (resolve = r));
  const seg: CheckpointSegment<Run> & { finish(): void; paused: boolean } = {
    result,
    paused: false,
    pause() {
      seg.paused = true;
      resolve({ label, stdout: `${label} paused;`, commits: [], paused: true });
    },
    finish() {
      resolve({ label, stdout: `${label} done;`, commits: [{ sha: label }] });
    },
  };
  return seg;
};

const fast = { pollMs: 2, minuteMs: 10 };

describe("checkpointBudget", () => {
  it("uses the brief's estimate times the factor", () => {
    expect(checkpointBudget({ plan, factor: 2 })).toEqual({
      estimateMinutes: 20,
      budgetMinutes: 40,
      size: "S",
      source: "brief",
    });
  });

  it("falls back to a label default, then `*`, then 30 minutes", () => {
    const defaults = {
      bug: { minutes: 10, size: "S" as const },
      "*": { minutes: 60, size: "L" as const },
    };
    expect(checkpointBudget({ labels: ["x", "bug"], defaults })).toMatchObject({
      estimateMinutes: 10,
      budgetMinutes: 15,
      source: "label:bug",
    });
    expect(checkpointBudget({ labels: ["x"], defaults })).toMatchObject({
      estimateMinutes: 60,
      size: "L",
      source: "default",
    });
    expect(checkpointBudget({})).toMatchObject({
      estimateMinutes: 30,
      budgetMinutes: 45,
      size: "M",
    });
    expect(() => checkpointBudget({ factor: 0.5 })).toThrow(RangeError);
  });
});

describe("createDriftDetector", () => {
  const empty = { files: [], log: "" };

  it("reports each file outside the brief once", () => {
    const detector = createDriftDetector({
      briefFiles: plan.files,
      diffLimit: 1000,
    });
    expect(
      detector.observe({
        files: [
          { path: "src/api/handler.ts", lines: 5 },
          { path: "src/api.test.ts", lines: 5 },
        ],
        log: "",
      }),
    ).toBeUndefined();
    const signal = detector.observe({
      files: [{ path: "src/billing.ts", lines: 3 }],
      log: "",
    });
    expect(signal).toMatchObject({ kind: "outside-brief" });
    expect(signal!.detail).toContain("src/billing.ts");
    expect(
      detector.observe({
        files: [{ path: "src/billing.ts", lines: 4 }],
        log: "",
      }),
    ).toBeUndefined();
    // Without a brief the signal is off.
    expect(
      createDriftDetector({ diffLimit: 1000 }).observe({
        files: [{ path: "anything.ts", lines: 1 }],
        log: "",
      }),
    ).toBeUndefined();
  });

  it("fires when the same error repeats the threshold, counting only new lines", () => {
    const detector = createDriftDetector({
      diffLimit: 1000,
      repeatThreshold: 3,
    });
    const failure = "Error: expected 200 to be 201 at line 14\n";
    let log = failure + failure;
    expect(detector.observe({ files: [], log })).toBeUndefined();
    // Numbers are normalized: a different line number is the same error.
    log += "Error: expected 200 to be 201 at line 15\n";
    expect(detector.observe({ files: [], log })).toMatchObject({
      kind: "repeated-error",
    });
    // Re-reading the same log adds nothing.
    expect(detector.observe({ files: [], log })).toBeUndefined();
    expect(detector.observe({ files: [], log })).toBeUndefined();
    expect(detector.observe(empty)).toBeUndefined();
  });

  it("fires on repeated edit and revert of the same file", () => {
    const detector = createDriftDetector({ diffLimit: 1000 });
    const at = (lines: number) =>
      detector.observe({
        files: lines ? [{ path: "a.ts", lines }] : [],
        log: "",
      });
    expect(at(40)).toBeUndefined();
    expect(at(0)).toBeUndefined(); // reverted
    expect(at(38)).toBeUndefined(); // cycle 1
    expect(at(10)).toBeUndefined();
    expect(at(40)).toMatchObject({ kind: "churn" }); // cycle 2
  });

  it("fires when the diff passes the size limit, then doubles the limit", () => {
    const detector = createDriftDetector({ diffLimit: diffLineLimit("S", 1) });
    const at = (lines: number) =>
      detector.observe({ files: [{ path: "a.ts", lines }], log: "" });
    expect(at(300)).toBeUndefined();
    expect(at(301)).toMatchObject({ kind: "diff-size" });
    expect(at(500)).toBeUndefined();
    expect(at(601)).toMatchObject({ kind: "diff-size" });
  });
});

describe("errorLinesOf", () => {
  it("extracts error lines from provider JSON once per line", () => {
    const raw = JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        aggregated_output:
          "FAIL src/a.test.ts\nError: boom at 12\nok line\nError: boom at 12",
      },
    });
    expect(errorLinesOf(raw)).toEqual([
      "FAIL src/a.test.ts",
      "Error: boom at 12",
    ]);
    expect(errorLinesOf("plain Error: not json here")).toEqual([
      "plain Error: not json here",
    ]);
    expect(errorLinesOf('{"type":"text","text":"all good"}')).toEqual([]);
  });

  it("ignores the agent's narration and tool input, such as code being written", () => {
    const code =
      "return targets.every(entry => !entry.error && entry.agreement?.ok);";
    // Claude stream-json: an assistant tool call writing that code.
    expect(
      errorLinesOf(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "The error is in the parser." },
              { type: "tool_use", name: "Write", input: { content: code } },
            ],
          },
        }),
      ),
    ).toEqual([]);
    // Its tool result does count.
    expect(
      errorLinesOf(
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                content: [
                  { type: "text", text: "TypeError: x is undefined\nok" },
                ],
              },
            ],
          },
        }),
      ),
    ).toEqual(["TypeError: x is undefined"]);
    // Codex: the command is input, the aggregated output is the result.
    expect(
      errorLinesOf(
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "command_execution",
            command: `grep -n "Error: " src/*.ts # ${code}`,
            aggregated_output: "src/a.ts(3,5): error TS2345: bad argument",
          },
        }),
      ),
    ).toEqual(["src/a.ts(3,5): error TS2345: bad argument"]);
    expect(
      errorLinesOf(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "Error: none left, 0 failed" },
        }),
      ),
    ).toEqual([]);
  });

  it("counts error-shaped output only", () => {
    const lines = [
      "No errors found; nothing failed.",
      `const failed = results.filter((r) => r.error);`,
      "catch (error) { log(error.message) }",
      " Tests  2 failed | 10 passed",
      "npm ERR! code ELIFECYCLE",
      "Process exited with code 1",
      "AssertionError: expected 1 to be 2",
      "error[E0308]: mismatched types",
      "  ✗ 489 (sandcastle/issue-489) failed: boom",
    ];
    expect(errorLinesOf(lines.join("\n"))).toEqual(
      lines.slice(3).map((line) => line.trim()),
    );
  });
});

describe("parseNumstat", () => {
  it("sums added and deleted lines and keeps binary files", () => {
    expect(
      parseNumstat("3\t2\tsrc/a.ts\n-\t-\tlogo.png\n7\t0\tnew.ts\n"),
    ).toEqual([
      { path: "src/a.ts", lines: 5 },
      { path: "logo.png", lines: 0 },
      { path: "new.ts", lines: 7 },
    ]);
  });
});

describe("runWithCheckpoints", () => {
  it("returns completed without a checkpoint when the implementer finishes in time", async () => {
    const first = segment("first");
    setTimeout(() => first.finish(), 5);
    const result = await runWithCheckpoints<Run>({
      ...fast,
      budgetMinutes: 100,
      start: () => first,
      check: async () => {
        throw new Error("not called");
      },
      resume: () => {
        throw new Error("not called");
      },
    });
    expect(result.outcome).toBe("completed");
    expect(result.checkpoints).toEqual([]);
    expect(result.commits).toEqual([{ sha: "first" }]);
  });

  it("fires time checkpoints at 50% and 100%, resumes, and accumulates work", async () => {
    const segments = [segment("s0"), segment("s1"), segment("s2")];
    const prompts: string[] = [];
    const budget = { remaining: 5 };
    const result = await runWithCheckpoints<Run>({
      ...fast,
      budgetMinutes: 2, // 20 ms
      budget,
      start: () => segments[0]!,
      check: async (n, signal) => {
        prompts.push(`${n}:${signal.kind}`);
        return {
          stdout: check(
            n === 1 ? {} : { verdict: "redirect", direction: "Use the cache." },
          ),
          commits: [],
        };
      },
      resume: (paused, value, n) => {
        expect(paused.paused).toBe(true);
        if (n === 2) setTimeout(() => segments[2]!.finish(), 2);
        return { segment: segments[n]!, mode: n === 1 ? "session" : "fresh" };
      },
    });
    expect(result.outcome).toBe("completed");
    expect(prompts).toEqual(["1:time", "2:time"]);
    expect(
      result.checkpoints.map((c) => [c.check?.verdict, c.resumed]),
    ).toEqual([
      ["continue", "session"],
      ["redirect", "fresh"],
    ]);
    expect(result.stdout).toBe("s0 paused;s1 paused;s2 done;");
    expect(result.commits).toEqual([{ sha: "s2" }]);
    expect(budget.remaining).toBe(3);
    expect(result.elapsedMinutes).toBeGreaterThanOrEqual(2);
  });

  it("fires early on a drift signal from the snapshot", async () => {
    const first = segment("first");
    let samples = 0;
    const result = await runWithCheckpoints<Run>({
      ...fast,
      budgetMinutes: 1000,
      detector: createDriftDetector({ briefFiles: ["src/"], diffLimit: 1000 }),
      snapshot: async () => ({
        files: ++samples > 2 ? [{ path: "docs/x.md", lines: 1 }] : [],
        log: "",
      }),
      start: () => first,
      check: async () => ({ stdout: check({ verdict: "stop" }), commits: [] }),
      resume: () => {
        throw new Error("not called");
      },
    });
    expect(first.paused).toBe(true);
    expect(result.outcome).toBe("stopped");
    expect(result.checkpoints[0]!.signal.kind).toBe("outside-brief");
    expect(result.checkpoints[0]!.check?.verdict).toBe("stop");
  });

  it("stops on malformed output and on an advisor that changed the repository", async () => {
    for (const [run, error] of [
      [{ stdout: "no tag", commits: [] }, /progress-check/],
      [{ stdout: check(), commits: [{ sha: "x" }] }, /changed the repository/],
    ] as const) {
      const result = await runWithCheckpoints<Run>({
        ...fast,
        budgetMinutes: 0.2,
        start: () => segment("first"),
        check: async () => run,
        resume: () => {
          throw new Error("not called");
        },
      });
      expect(result.outcome).toBe("invalid-check");
      expect(result.error).toMatch(error);
    }
  });

  it("ends with cap-reached when a checkpoint fires after the limit", async () => {
    const segments = [segment("s0"), segment("s1")];
    const result = await runWithCheckpoints<Run>({
      ...fast,
      budgetMinutes: 0.4,
      max: 1,
      start: () => segments[0]!,
      check: async () => ({
        stdout: check({ remainingBudget: 0 }),
        commits: [],
      }),
      resume: (_paused, _check, n) => ({
        segment: segments[n]!,
        mode: "session",
      }),
    });
    expect(result.outcome).toBe("cap-reached");
    expect(segments[1]!.paused).toBe(true);
    expect(result.checkpoints).toHaveLength(2);
    expect(result.error).toContain("checkpoint limit 1");
  });

  it("skips checkpoints once the shared advisor budget is spent", async () => {
    const first = segment("first");
    setTimeout(() => first.finish(), 30);
    const result = await runWithCheckpoints<Run>({
      ...fast,
      budgetMinutes: 0.5,
      budget: { remaining: 0 },
      start: () => first,
      check: async () => {
        throw new Error("not called");
      },
      resume: () => {
        throw new Error("not called");
      },
    });
    expect(result.outcome).toBe("completed");
    expect(first.paused).toBe(false);
    expect(result.checkpoints[0]!.skipped).toBe("advisor-budget-spent");
  });

  it("propagates an implementer failure unchanged", async () => {
    const failure = new Error("provider down");
    await expect(
      runWithCheckpoints<Run>({
        ...fast,
        budgetMinutes: 100,
        start: () => ({ result: Promise.reject(failure), pause: () => {} }),
        check: async () => ({ stdout: "", commits: [] }),
        resume: () => {
          throw new Error("not called");
        },
      }),
    ).rejects.toBe(failure);
  });
});

describe("withProgressCheck", () => {
  it("attaches the check or an invalid verdict with the signal", async () => {
    const signal = { kind: "churn" as const, detail: "a.ts" };
    expect(
      (
        await withProgressCheck(
          {
            stdout: check({
              verdict: "redirect",
              direction: "Stop reverting.",
            }),
          },
          signal,
        )
      ).checkpoint,
    ).toMatchObject({
      verdict: "redirect",
      signal: "churn",
      direction: "Stop reverting.",
    });
    expect(
      (
        await withProgressCheck(
          { stdout: check({ verdict: "redirect" }) },
          signal,
        )
      ).checkpoint,
    ).toMatchObject({ verdict: "invalid", signal: "churn" });
  });
});
