/** Options for {@link settleRolling}. */
export interface RollingSettleOptions<T> {
  /** Items to run first, in order. */
  readonly issues: readonly T[];
  /** Maximum items running at once. Default: every item at once. */
  readonly concurrency?: number;
  /**
   * Called when a running item settles and slots are free, with the number of
   * free slots. Returns the items to start next (at most `free`; extra items
   * are an error). Never called while another refill is running. An empty
   * result means nothing can start now; the next settle asks again.
   */
  readonly refill?: (free: number) => Promise<readonly T[]>;
  /** Called when an item settles, before any refill. */
  readonly onSettle?: (issue: T) => void;
}

/** Outcome of {@link settleRolling}. */
export interface RollingSettleResult<T, R> {
  /** Every started item, in start order. */
  readonly issues: readonly T[];
  /** One result per started item, aligned with `issues`. */
  readonly settled: PromiseSettledResult<R>[];
  /** Set when a refill failed; no further refill was attempted. */
  readonly refillError?: unknown;
}

/**
 * Run items with a concurrency bound and, when `refill` is given, start new
 * items as slots free up instead of waiting for the whole batch. A failing
 * item never stops the others; a failing refill stops further refills and is
 * reported, while running items finish.
 */
export const settleRolling = async <T, R>(
  options: RollingSettleOptions<T>,
  execute: (issue: T) => Promise<R>,
): Promise<RollingSettleResult<T, R>> => {
  const limit = options.concurrency ?? Number.POSITIVE_INFINITY;
  if (!(limit >= 1)) throw new RangeError("concurrency must be at least 1");
  const issues: T[] = [];
  const settled: PromiseSettledResult<R>[] = [];
  const queue = [...options.issues];
  let running = 0;
  let refilling = false;
  // A settle while a refill runs asks for one more refill afterwards.
  let settledDuringRefill = false;
  let refillError: unknown;
  let refillFailed = false;

  return new Promise((resolve) => {
    const finishIfIdle = () => {
      if (running === 0 && !refilling && queue.length === 0)
        resolve({
          issues,
          settled,
          ...(refillFailed ? { refillError } : {}),
        });
    };
    const start = (issue: T) => {
      const index = issues.push(issue) - 1;
      running++;
      execute(issue)
        .then(
          (value) => {
            settled[index] = { status: "fulfilled", value };
          },
          (reason: unknown) => {
            settled[index] = { status: "rejected", reason };
          },
        )
        .finally(() => {
          running--;
          options.onSettle?.(issue);
          pump(true);
        });
    };
    const pump = (afterSettle: boolean) => {
      while (queue.length > 0 && running < limit) start(queue.shift()!);
      const free = limit - running;
      if (
        afterSettle &&
        options.refill &&
        !refillFailed &&
        queue.length === 0 &&
        free > 0 &&
        Number.isFinite(free)
      ) {
        if (refilling) settledDuringRefill = true;
        else {
          refilling = true;
          settledDuringRefill = false;
          options
            .refill(free)
            .then((next) => {
              if (next.length > free)
                throw new RangeError(
                  `refill returned ${next.length} items for ${free} free slot(s)`,
                );
              queue.push(...next);
            })
            .catch((error: unknown) => {
              refillFailed = true;
              refillError = error;
            })
            .finally(() => {
              refilling = false;
              // Ask again only if something settled meanwhile.
              pump(settledDuringRefill);
            });
          return;
        }
      }
      finishIfIdle();
    };
    pump(false);
  });
};
