import { Effect } from "effect";
import { expect, test } from "vitest";
import { AgentIdleTimeoutError } from "./errors.js";
import {
  adviseWhenStuck,
  formatStuckAdvice,
  type StuckRun,
} from "./StuckAdvisor.js";
import { isIdleTimeout } from "./TaskRetry.js";

const advice = (extra: Record<string, unknown> = {}) => ({
  diagnosis: "The importer test fails because the fixture lacks a request key.",
  cause: "wrong-approach",
  nextSteps: ["Add a request key to the fixture", "Rerun the importer tests"],
  confidence: "high",
  escalate: false,
  ...extra,
});
const out = (value: unknown, commits: { sha: string }[] = []): StuckRun => ({
  stdout: `<stuck-advice>${JSON.stringify(value)}</stuck-advice>\n<promise>COMPLETE</promise>`,
  commits,
});
const script = (advices: StuckRun[], resolved: boolean[]) => {
  const calls: string[] = [];
  return {
    calls,
    advise: async (n: number) => {
      calls.push(`advise:${n}`);
      return advices.shift()!;
    },
    retry: async (_advice: unknown, n: number) => {
      calls.push(`retry:${n}`);
      return { resolved: resolved.shift()!, value: n };
    },
  };
};

test("advice followed by a successful advised attempt resolves", async () => {
  const s = script([out(advice())], [true]);
  const result = await adviseWhenStuck({
    trigger: "implementation-incomplete",
    ...s,
  });
  expect(result).toMatchObject({ outcome: "resolved", value: 1, attempts: 1 });
  expect(s.calls).toEqual(["advise:1", "retry:1"]);
});

test("advised attempts that still fail end as failed-again with the last diagnosis", async () => {
  const s = script(
    [out(advice()), out(advice({ diagnosis: "Second look" }))],
    [false, false],
  );
  const result = await adviseWhenStuck({
    trigger: "review-budget-exhausted",
    attempts: 2,
    ...s,
  });
  expect(result.outcome).toBe("failed-again");
  expect(result.advice?.diagnosis).toBe("Second look");
  expect(s.calls).toEqual(["advise:1", "retry:1", "advise:2", "retry:2"]);
});

test("escalation and owner-only causes never trigger another attempt", async () => {
  for (const value of [
    advice({ escalate: true }),
    advice({ cause: "environment" }),
    advice({ cause: "missing-dependency" }),
  ]) {
    const s = script([out(value)], []);
    const result = await adviseWhenStuck({ trigger: "idle-timeout", ...s });
    expect(result.outcome).toBe("escalated");
    expect(s.calls).toEqual(["advise:1"]);
  }
});

test("malformed advice and an advisor that changed the repository fail closed", async () => {
  for (const run of [
    { stdout: "no advice", commits: [] },
    out(advice({ cause: "bad-luck" })),
    out(advice({ nextSteps: [] })),
    out(advice(), [{ sha: "x" }]),
  ]) {
    const s = script([run], []);
    const result = await adviseWhenStuck({
      trigger: "implementation-incomplete",
      ...s,
    });
    expect(result.outcome).toBe("invalid-advice");
    expect(s.calls).toEqual(["advise:1"]);
  }
});

test("zero attempts and a spent budget skip the advisor", async () => {
  const none = script([], []);
  expect(
    (
      await adviseWhenStuck({
        trigger: "implementation-incomplete",
        attempts: 0,
        ...none,
      })
    ).outcome,
  ).toBe("skipped");
  expect(none.calls).toEqual([]);
  const budget = { remaining: 0 };
  const spent = script([], []);
  expect(
    (
      await adviseWhenStuck({
        trigger: "implementation-incomplete",
        budget,
        ...spent,
      })
    ).outcome,
  ).toBe("skipped");
  const counted = { remaining: 1 };
  await adviseWhenStuck({
    trigger: "implementation-incomplete",
    budget: counted,
    ...script([out(advice())], [true]),
  });
  expect(counted.remaining).toBe(0);
  await expect(
    adviseWhenStuck({
      trigger: "implementation-incomplete",
      attempts: 3,
      ...none,
    }),
  ).rejects.toThrow(RangeError);
});

test("advice renders for the implementer and idle timeouts are recognized through fiber failures", async () => {
  expect(formatStuckAdvice(advice() as never)).toBe(
    "Diagnosis (wrong-approach, confidence high): The importer test fails because the fixture lacks a request key.\n1. Add a request key to the fixture\n2. Rerun the importer tests",
  );
  const failure = await Effect.runPromise(
    Effect.fail(new AgentIdleTimeoutError({ message: "idle", timeoutMs: 1 })),
  ).catch((error: unknown) => error);
  expect(isIdleTimeout(failure)).toBe(true);
  expect(isIdleTimeout(new Error("other"))).toBe(false);
});
