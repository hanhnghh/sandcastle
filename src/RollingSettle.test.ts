import { describe, expect, it } from "vitest";
import { settleRolling } from "./RollingSettle.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("settleRolling", () => {
  it("settles every item in start order like Promise.allSettled", async () => {
    const result = await settleRolling({ issues: [1, 2, 3] }, async (n) => {
      await delay(10 - n * 3);
      if (n === 2) throw new Error("two");
      return n * 10;
    });
    expect(result.issues).toEqual([1, 2, 3]);
    expect(result.settled.map((s) => s.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(result.refillError).toBeUndefined();
  });

  it("never runs more than the concurrency bound", async () => {
    let running = 0;
    let peak = 0;
    await settleRolling(
      { issues: [1, 2, 3, 4, 5], concurrency: 2 },
      async () => {
        peak = Math.max(peak, ++running);
        await delay(5);
        running--;
      },
    );
    expect(peak).toBe(2);
  });

  it("starts refilled items as soon as a slot frees, without waiting for the slowest", async () => {
    const events: string[] = [];
    const refills: number[] = [];
    let round = 0;
    const result = await settleRolling(
      {
        issues: ["fast", "slow"],
        concurrency: 2,
        refill: async (free) => {
          refills.push(free);
          return ++round === 1 ? ["next"] : [];
        },
      },
      async (name) => {
        events.push(`start:${name}`);
        await delay(name === "slow" ? 60 : 10);
        events.push(`end:${name}`);
        return name;
      },
    );
    // "next" starts after "fast" ends and before "slow" ends.
    expect(events.indexOf("start:next")).toBeGreaterThan(
      events.indexOf("end:fast"),
    );
    expect(events.indexOf("start:next")).toBeLessThan(
      events.indexOf("end:slow"),
    );
    expect(result.issues).toEqual(["fast", "slow", "next"]);
    expect(refills[0]).toBe(1);
  });

  it("never runs two refills at once and asks again for settles during a refill", async () => {
    let active = 0;
    let overlapped = false;
    let calls = 0;
    const result = await settleRolling(
      {
        issues: [5, 6],
        concurrency: 2,
        refill: async () => {
          overlapped ||= ++active > 1;
          calls++;
          await delay(30);
          active--;
          return calls === 2 ? [7] : [];
        },
      },
      async (n) => {
        await delay(n === 5 ? 5 : 10);
        return n;
      },
    );
    expect(overlapped).toBe(false);
    // The settle of 6 during the first refill triggers the second one.
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.issues).toEqual([5, 6, 7]);
  });

  it("stops refilling after a refill error and still finishes running items", async () => {
    let calls = 0;
    const result = await settleRolling(
      {
        issues: [1, 2],
        concurrency: 2,
        refill: async () => {
          calls++;
          throw new Error("planner down");
        },
      },
      async (n) => {
        await delay(n * 10);
        return n;
      },
    );
    expect(calls).toBe(1);
    expect(result.settled).toHaveLength(2);
    expect(String(result.refillError)).toContain("planner down");
  });

  it("treats a refill above the free slots as a refill error", async () => {
    const result = await settleRolling(
      {
        issues: [1],
        concurrency: 1,
        refill: async () => [2, 3],
      },
      async (n) => n,
    );
    expect(result.issues).toEqual([1]);
    expect(String(result.refillError)).toContain("2 items for 1 free slot");
  });

  it("does not refill without a finite bound, and resolves for no items", async () => {
    let calls = 0;
    const refill = async () => {
      calls++;
      return [];
    };
    await settleRolling({ issues: [1], refill }, async (n) => n);
    const empty = await settleRolling(
      { issues: [], concurrency: 2, refill },
      async (n) => n,
    );
    expect(calls).toBe(0);
    expect(empty.issues).toEqual([]);
  });
});
