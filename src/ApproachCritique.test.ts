import { expect, test } from "vitest";
import {
  formatApproachCritique,
  runApproachCritique,
  type ApproachRun,
} from "./ApproachCritique.js";

const plan = (extra: Record<string, unknown> = {}) => ({
  goal: "Add retry to the importer",
  size: "M",
  estimate: { minutes: 40, iterations: 3 },
  files: ["src/importer.ts", "src/importer.test.ts"],
  steps: ["Wrap fetch in a bounded retry", "Add tests"],
  tests: ["importer retries transient errors"],
  risks: ["Duplicate imports on retry"],
  ...extra,
});
const concern = {
  id: "C1",
  severity: "major",
  point: "Retrying a non-idempotent import duplicates rows",
  suggestion: "Make the import idempotent with a request key first",
};
const critique = (
  verdict: string,
  concerns: unknown[] = [],
  summary = "ok",
) => ({ verdict, summary, concerns });
const out = (tag: string, value: unknown, extra = ""): ApproachRun => ({
  stdout: `${extra}<${tag}>${JSON.stringify(value)}</${tag}>\n<promise>COMPLETE</promise>`,
  commits: [],
});
const script = (plans: ApproachRun[], critiques: ApproachRun[]) => {
  const calls: string[] = [];
  const answered: unknown[] = [];
  return {
    calls,
    answered,
    plan: async (round: number, previous: unknown) => {
      calls.push(`plan:${round}`);
      answered.push(previous);
      return plans.shift()!;
    },
    critique: async (round: number) => {
      calls.push(`critique:${round}`);
      return critiques.shift()!;
    },
  };
};

test("proceed passes the brief and critique on to implementation", async () => {
  const s = script(
    [out("approach-plan", plan())],
    [out("approach-critique", critique("proceed"))],
  );
  const result = await runApproachCritique(s);
  expect(result.outcome).toBe("proceed");
  expect(result.plan?.size).toBe("M");
  expect(result.critique?.verdict).toBe("proceed");
  expect(s.calls).toEqual(["plan:1", "critique:1"]);
});

test("revise asks for a revised brief that answers every concern, then proceeds", async () => {
  const s = script(
    [
      out("approach-plan", plan()),
      out(
        "approach-plan",
        plan({
          dispositions: [
            {
              concern: "C1",
              decision: "accepted",
              reason: "Added request key",
            },
          ],
        }),
      ),
    ],
    [
      out("approach-critique", critique("revise", [concern])),
      out("approach-critique", critique("proceed")),
    ],
  );
  const result = await runApproachCritique(s);
  expect(result.outcome).toBe("proceed");
  expect(s.calls).toEqual(["plan:1", "critique:1", "plan:2", "critique:2"]);
  expect((s.answered[1] as { concerns: unknown[] }).concerns).toEqual([
    concern,
  ]);
  expect(result.counts).toEqual({ accepted: 1, disputed: 0, escalated: false });
});

test("disputes still unresolved after the budget escalate instead of looping", async () => {
  const disputed = plan({
    dispositions: [
      {
        concern: "C1",
        decision: "disputed",
        reason: "Import is already idempotent",
      },
    ],
  });
  const s = script(
    [out("approach-plan", plan()), out("approach-plan", disputed)],
    [
      out("approach-critique", critique("revise", [concern])),
      out("approach-critique", critique("revise", [concern])),
    ],
  );
  const result = await runApproachCritique({ ...s, rounds: 1 });
  expect(result.outcome).toBe("escalate");
  expect(result.reason).toBe("unresolved-after-budget");
  expect(result.counts).toEqual({ accepted: 0, disputed: 1, escalated: true });
});

test("advisor escalation, malformed output, missing dispositions and repository changes all escalate", async () => {
  const cases: [ApproachRun[], ApproachRun[], string][] = [
    [
      [out("approach-plan", plan())],
      [
        out(
          "approach-critique",
          critique("escalate", [], "Task contract is contradictory"),
        ),
      ],
      "advisor-escalated",
    ],
    [
      [{ stdout: "no brief <promise>COMPLETE</promise>", commits: [] }],
      [],
      "invalid-plan",
    ],
    [[out("approach-plan", plan({ size: "XL" }))], [], "invalid-plan"],
    [
      [out("approach-plan", plan())],
      [out("approach-critique", { verdict: "proceed" })],
      "invalid-critique",
    ],
    [
      [out("approach-plan", plan())],
      [out("approach-critique", critique("revise", []))],
      "invalid-critique",
    ],
    [
      [out("approach-plan", plan()), out("approach-plan", plan())],
      [out("approach-critique", critique("revise", [concern]))],
      "missing-dispositions",
    ],
    [
      [{ ...out("approach-plan", plan()), commits: [{ sha: "x" }] }],
      [],
      "plan-modified-repository",
    ],
    [
      [out("approach-plan", plan())],
      [
        {
          ...out("approach-critique", critique("proceed")),
          commits: [{ sha: "y" }],
        },
      ],
      "advisor-modified-repository",
    ],
  ];
  for (const [plans, critiques, reason] of cases) {
    const result = await runApproachCritique(script(plans, critiques));
    expect(result.outcome, reason).toBe("escalate");
    expect(result.reason).toBe(reason);
  }
});

test("a spent per-run advisor budget skips critique and records it", async () => {
  const budget = { remaining: 1 };
  const first = script(
    [out("approach-plan", plan())],
    [out("approach-critique", critique("proceed"))],
  );
  expect((await runApproachCritique({ ...first, budget })).outcome).toBe(
    "proceed",
  );
  expect(budget.remaining).toBe(0);
  const second = script([out("approach-plan", plan())], []);
  const result = await runApproachCritique({ ...second, budget });
  expect(result).toMatchObject({
    outcome: "skipped",
    reason: "advisor-budget-spent",
  });
  expect(second.calls).toEqual(["plan:1"]);
  await expect(runApproachCritique({ ...first, rounds: -1 })).rejects.toThrow(
    RangeError,
  );
});

test("critique renders as implementer input", () => {
  expect(
    formatApproachCritique({
      verdict: "revise",
      summary: "Rework retries.",
      concerns: [concern as never],
    }),
  ).toBe(
    "Verdict: revise. Rework retries.\n- [C1] (major) Retrying a non-idempotent import duplicates rows Suggestion: Make the import idempotent with a request key first",
  );
});
