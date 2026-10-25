// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFile } from "node:child_process";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
// @ts-expect-error scaffold copies the shared helper beside main.mts.
import { validatePlannerBatch } from "./planner-batch.js";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const decisionSchema = z.object({
  id: z.string(),
  disposition: z.enum([
    "selected",
    "blocked",
    "not-implementation",
    "unresolved-decision",
    "parallel-conflict",
  ]),
  reason: z.string().min(1),
  likelyAreas: z.array(z.string()),
  conflictsWith: z.array(z.string()).optional(),
});

const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
  decisions: z.array(decisionSchema),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;
const MAX_PLANNER_ATTEMPTS = 3;
// Implementer repair rounds after a changes-requested review; 0 = single-pass review.
const MAX_REPAIR_ROUNDS = 2;
// Review rounds of one issue are counted across attempts and runs. From round
// REVIEW_SWEEP_FROM the reviewer sweeps whole defect classes at
// REVIEW_SWEEP_EFFORT; a major finding restated REVIEW_REPEAT_LIMIT times, or
// REVIEW_ROUND_CAP rounds without approval, hands the issue to the owner. 0 disables.
const REVIEW_SWEEP_FROM = 3;
const REVIEW_SWEEP_EFFORT = "high";
const REVIEW_ROUND_CAP = 7;
const REVIEW_REPEAT_LIMIT = 2;
// Label that keeps the planner away from an issue until the owner removes it.
const OWNER_LABEL = "needs-owner";
// Kept in the shared git directory, beside the readiness audit, so every
// worktree and run of this repository sees the same counts.
const reviewHistory = sandcastle.reviewHistoryStore(
  join(
    (
      await runHost("git", [
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ])
    ).trim(),
    "sandcastle",
    "review-history.json",
  ),
);
// Extra attempts for provider/infrastructure failures of one issue pipeline.
const TASK_RETRIES = 1;
// Stop starting pipelines after this many consecutive provider failures.
const PROVIDER_FAILURE_THRESHOLD = 3;
const breaker = sandcastle.createCircuitBreaker(PROVIDER_FAILURE_THRESHOLD);
// "batch": one merger integrates the whole batch after every pipeline settles.
// "per-branch": each approved branch is integrated as soon as it is approved.
const MERGE_MODE: "batch" | "per-branch" = "batch";
// Per-branch merge: integrate every branch approved while a merge runs in one
// merger (one cumulative gate); a failed group is retried in halves.
const MERGE_COALESCE = false;
// Test workers for the merger's cumulative gate (SANDCASTLE_TEST_WORKERS);
// implementers and reviewers keep one. With more than one, the merger sandbox
// first runs .sandcastle/scripts/test-isolation.sh <workers> when present.
const GATE_TEST_WORKERS = 1;
// Scripted cumulative gate. When set, the merger only integrates and commits;
// the host then runs this command ({{BATCH_BASE_SHA}} replaced) in the
// merger's sandbox, hands a failing gate's output back to the merger for up to
// `repairs` repairs, and closes the issues once it passes. Unset: the merger
// runs the gate and closes the issues itself.
const MERGE_GATE: { command: string; repairs: number } | undefined = undefined;
// Issue pipelines at once. The rolling schedule needs a finite bound.
const CONCURRENCY = Number.POSITIVE_INFINITY;
// "batch": plan again after every pipeline of the batch settles.
// "rolling" (per-branch merge only): when a pipeline settles and its branch is
// integrated, plan more issues for the free slots while the others keep running.
const SCHEDULE: "batch" | "rolling" = "batch";
// Rolling: while slots are free, check the backlog this often and plan again
// when it changed, instead of waiting for a pipeline to settle.
const IDLE_REFILL_MINUTES = 15;
function rollingSchedule() {
  return (
    SCHEDULE === "rolling" &&
    MERGE_MODE === "per-branch" &&
    Number.isFinite(CONCURRENCY)
  );
}
// Advisor approach critique before implementation: "off" | "high-risk" | "all".
// The advisor critiques direction only; it never edits code or the tracker.
const ADVISOR_APPROACH: "off" | "high-risk" | "all" = "off";
const ADVISOR_HIGH_RISK_LABEL = "risk:high";
const ADVISOR_APPROACH_ROUNDS = 1;
const advisorBudget = { remaining: 20 };
// Consult the advisor when an implementation stalls: "off" | "on".
const ADVISOR_STUCK: "off" | "on" = "off";
const ADVISOR_STUCK_ATTEMPTS = 1;
// Progress checkpoints: pause a long or drifting implementer for an advisor
// check, then resume it with direction (workflow.json advisor.checkpoint).
const ADVISOR_CHECKPOINT: sandcastle.CheckpointPolicy = { mode: "off" };
const advisorAgent = () => sandcastle.claudeCode("claude-opus-4-8");
// Post-merge readiness is incremental; every Nth post-merge run is full.
const READINESS_FULL_EVERY = 5;
let postMergeAssessments = 0;

// Host commands must not block recording heartbeats or other pipeline callbacks.
function runHost(
  file: string,
  args: string[],
  options: { input?: string; timeout?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "utf8",
        timeout: options.timeout ?? 90_000,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin?.on("error", () => {}); // A failed child is reported by the callback.
    child.stdin?.end(options.input);
  });
}

// An escalated stall goes to the owner the same way an escalated review does:
// the owner label keeps the planner away, and the comment carries the advice.
async function handToOwner(issueId: string, body: string): Promise<void> {
  try {
    await runHost("gh", ["issue", "edit", issueId, "--add-label", OWNER_LABEL]);
    await runHost("gh", ["issue", "comment", issueId, "--body-file", "-"], {
      input: body,
    });
  } catch (error) {
    console.warn(`  ! could not hand issue ${issueId} to the owner: ${error}`);
  }
}

// Set an explicit fork repository and stable scope label before enabling.
// Null repository leaves existing tracker workflows unchanged (no GitHub calls).
const readiness = z
  .object({
    mode: z.enum(["disabled", "report-only", "apply"]),
    repository: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/)
      .nullable(),
    scopeLabel: z.string().min(1),
    readyLabel: z.string().min(1),
    blockedLabel: z.string().min(1),
    holdLabels: z.array(z.string().min(1)),
    qualificationLabel: z.string().min(1).default("ready-for-qualification"),
    publishBody: z.boolean().default(false),
    contextIssueNumbers: z.array(z.number().int().positive()).optional(),
    verifyCommand: z.array(z.string().min(1)).min(1).nullable(),
  })
  .strict()
  .parse(JSON.parse(readFileSync(".sandcastle/readiness.json", "utf8")));
const readinessEnabled =
  readiness.mode !== "disabled" && readiness.repository !== null;
const trackerEnvironment: Record<string, string> = readinessEnabled
  ? { GH_REPO: readiness.repository! }
  : {};
// Host prompt commands and every execution sandbox must target the same fork.
if (readinessEnabled) process.env.GH_REPO = readiness.repository!;
const readinessEnvironment = {
  GH_TOKEN: "",
  GITHUB_TOKEN: "",
  GH_ENTERPRISE_TOKEN: "",
  GITHUB_ENTERPRISE_TOKEN: "",
  GH_CONFIG_DIR: "/tmp/readiness-gh",
};

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: { onSandboxReady: [{ command: "npm install" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

// The merger runs the cumulative gate with GATE_TEST_WORKERS test workers and,
// with more than one, provisions isolated test resources first. Sandcastle runs
// onSandboxReady hooks concurrently, so provisioning is chained after the ready
// hooks in one command: it needs the dependencies the ready hooks may reinstall.
const gateEnvironment = {
  ...trackerEnvironment,
  SANDCASTLE_TEST_WORKERS: String(GATE_TEST_WORKERS),
};
const readyHooks = hooks.sandbox?.onSandboxReady ?? [];
const gateHooks =
  GATE_TEST_WORKERS > 1
    ? {
        ...hooks,
        sandbox: {
          ...hooks.sandbox,
          onSandboxReady: [
            {
              command: [
                ...readyHooks.map((hook) => `( ${hook.command} )`),
                `if [ -f .sandcastle/scripts/test-isolation.sh ]; then bash .sandcastle/scripts/test-isolation.sh ${GATE_TEST_WORKERS}; fi`,
              ].join(" && "),
              timeoutMs: readyHooks.reduce((sum, hook) => sum + (hook.timeoutMs ?? 60_000), 600_000),
            },
          ],
        },
      }
    : hooks;

// The host records the map independently of the optional dashboard process.
// In a second terminal: npx sandcastle dashboard
const agentMap = await sandcastle.createAgentMap({
  cwd: process.cwd(),
  name: "Parallel planner with review",
});

const loadPlannerInventory = async (): Promise<unknown[]> =>
  readinessEnabled
    ? sandcastle.loadGitHubReadinessInventory({
        ...readiness,
        repository: readiness.repository!,
        cwd: process.cwd(),
      })
    : (JSON.parse(
        await runHost("bash", [".sandcastle/planner-inventory.sh"]),
      ) as unknown[]);

// The planner's candidate rows: readiness-eligible issues, or the inventory.
const eligibleBacklog = async (): Promise<readonly unknown[]> =>
  readinessEnabled
    ? (
        await sandcastle.inspectGitHubReadinessBacklog({
          ...readiness,
          repository: readiness.repository!,
          cwd: process.cwd(),
        })
      ).eligible
    : loadPlannerInventory();

const currentBranch = async () =>
  (await runHost("git", ["rev-parse", "--abbrev-ref", "HEAD"])).trim();

// Host-side tracker reads for the advisor (the advisor itself has no tracker access).
async function issueView(
  id: string,
): Promise<{ body?: string; labels?: { name: string }[] }> {
  return JSON.parse(
    await runHost("gh", ["issue", "view", id, "--json", "body,labels"]),
  );
}
async function issueLabels(id: string): Promise<string[]> {
  return ((await issueView(id)).labels ?? []).map((label) => label.name);
}
async function issueBody(id: string): Promise<string> {
  return (await issueView(id)).body ?? "";
}

async function reassess(batch: number, trigger: sandcastle.ReadinessTrigger) {
  if (!readinessEnabled) return;
  const incremental =
    trigger.kind === "post-merge" &&
    ++postMergeAssessments % READINESS_FULL_EVERY !== 0;
  await agentMap.track(
    {
      batch,
      role: "readiness",
      title: `Readiness / ${trigger.kind} / ${readiness.mode}`,
      branch: await currentBranch(),
    },
    async (logging) => {
      const result = await sandcastle.reassessGitHubReadiness({
        ...readiness,
        mode: readiness.mode === "apply" ? "apply" : "report-only",
        repository: readiness.repository!,
        cwd: process.cwd(),
        trigger,
        incremental,
        verify: readiness.verifyCommand
          ? async (input) =>
              JSON.parse(
                await runHost(
                  readiness.verifyCommand![0]!,
                  readiness.verifyCommand!.slice(1),
                  {
                    input: JSON.stringify(input),
                    timeout: 300_000,
                  },
                ),
              )
          : undefined,
        assess: async (snapshot) => {
          // Fresh worktree, no bootstrap hooks, no tracker credentials.
          const branch = `sandcastle/readiness-${randomUUID()}`;
          const sandbox = await sandcastle.createSandbox({
            branch,
            sandbox: docker({ env: readinessEnvironment }),
            copyToWorktree: [],
          });
          try {
            const run = await sandbox.run({
              logging,
              name: "readiness",
              maxIterations: 1,
              agent: sandcastle.claudeCode("claude-opus-4-8"),
              promptFile: "./.sandcastle/readiness-prompt.md",
              promptArgs: {
                READINESS_INPUT: JSON.stringify({ snapshot, trigger }),
              },
              completionSignal: [
                "<promise>COMPLETE</promise>",
                "<promise>BLOCKED</promise>",
              ],
            });
            const status = await sandbox.exec(
              "git status --porcelain --untracked-files=all",
            );
            if (
              run.completionSignal !== "<promise>COMPLETE</promise>" ||
              run.commits.length ||
              status.exitCode !== 0 ||
              status.stdout.trim()
            ) {
              throw new Error(
                "Readiness assessment incomplete or modified its checkout; refusing publication",
              );
            }
            const blocks = [
              ...run.stdout.matchAll(/<readiness>([\s\S]*?)<\/readiness>/g),
            ];
            if (blocks.length !== 1)
              throw new Error("Expected exactly one readiness result");
            return JSON.parse(
              blocks[0]![1]!.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""),
            );
          } finally {
            await sandbox.close();
          }
        },
      });
      console.log(
        `Readiness ${result.mode}: ${result.applied.length} issue(s) changed. Audit: ${result.auditPath}`,
      );
      if (logging.type === "file")
        logging.onAgentStreamEvent?.({
          type: "text",
          message: JSON.stringify({
            mode: result.mode,
            decisions: result.assessment.decisions,
            applied: result.applied,
            auditPath: result.auditPath,
          }),
          timestamp: new Date(),
          iteration: 1,
        });
      return { completionSignal: "<promise>COMPLETE</promise>", commits: [] };
    },
  );
}

// Inventory rows identify issues by `id` or `number`.
const rowIdentity = (row: unknown) => {
  const candidate = z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      number: z.number().optional(),
    })
    .passthrough()
    .parse(row);
  return String(candidate.id ?? candidate.number);
};

/** Rolling refill: issues to leave out and the free slots to fill. */
interface RefillRequest {
  readonly exclude: ReadonlySet<string>;
  readonly inProgress: readonly {
    id: string;
    title: string;
    likelyAreas: readonly string[];
  }[];
  readonly limit: number;
}

async function planNextBatch(batch: number, refill?: RefillRequest) {
  const backlog = readinessEnabled
    ? await sandcastle.inspectGitHubReadinessBacklog({
        ...readiness,
        repository: readiness.repository!,
        cwd: process.cwd(),
      })
    : undefined;
  const head =
    backlog?.snapshot.head ??
    (await runHost("git", ["rev-parse", "HEAD"])).trim();
  const branch = backlog?.branch ?? (await currentBranch());
  const inventory = (
    backlog?.eligible ?? (await loadPlannerInventory())
  ).filter((row) => !refill?.exclude.has(rowIdentity(row)));
  // Nothing left to plan: a refill skips the planner.
  if (refill && inventory.length === 0)
    return {
      plan: { issues: [], decisions: [] } as z.infer<typeof planSchema>,
      inventory,
      backlog,
      head,
      branch,
    };
  // A refill tells the planner what is still running and how much may start.
  const refillNote = refill
    ? `Rolling refill: ${refill.limit} pipeline slot(s) are free while other issues are still in progress. ` +
      `In progress (not in the inventory): ${refill.inProgress.map((issue) => `#${issue.id} ${issue.title} (areas: ${issue.likelyAreas.join(", ") || "unknown"})`).join("; ") || "none"}. ` +
      `Select at most ${refill.limit} issue(s) that neither depend on nor change the same areas as the issues in progress, or none if nothing can safely start now. ` +
      `Record an issue held back by work in progress as parallel-conflict with conflictsWith naming the in-progress issue ids.`
    : undefined;
  let feedback = refillNote ?? "No previous validation failure.";

  for (let attempt = 1; attempt <= MAX_PLANNER_ATTEMPTS; attempt++) {
    let validationFailed = false;
    try {
      const result = await agentMap.track(
        {
          batch,
          role: "planner",
          title: `Plan attempt ${attempt}`,
          branch: await currentBranch(),
        },
        async (logging) => {
          const result = await sandcastle.run({
            logging,
            hooks,
            sandbox: docker({ env: trackerEnvironment }),
            name: `planner-${attempt}`,
            maxIterations: 1,
            agent: sandcastle.claudeCode("claude-opus-4-8"),
            promptFile: "./.sandcastle/plan-prompt.md",
            promptArgs: {
              ISSUES_JSON: JSON.stringify(inventory),
              PLAN_FEEDBACK: feedback,
            },
            output: sandcastle.Output.object({
              tag: "plan",
              schema: planSchema,
            }),
          });

          try {
            validatePlannerBatch(inventory, result.output, refill?.inProgress);
          } catch (error) {
            validationFailed = true;
            throw error;
          }
          return result;
        },
      );
      return { plan: result.output, inventory, backlog, head, branch };
    } catch (error) {
      // Observe execution errors, but only retry invalid plans as before.
      if (!validationFailed) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      feedback = refillNote ? `${refillNote}\n\n${reason}` : reason;
      console.warn(`Planner attempt ${attempt} rejected: ${reason}`);
    }
  }

  throw new Error(`Planner failed validation: ${feedback}`);
}

/** Admit planned issues: the readiness snapshot or inventory must be unchanged. */
async function admitPlanned(
  planned: Awaited<ReturnType<typeof planNextBatch>>,
  issues: readonly { id: string }[],
) {
  if (planned.backlog) {
    await sandcastle.admitGitHubReadinessBatch(
      {
        ...readiness,
        repository: readiness.repository!,
        cwd: process.cwd(),
      },
      {
        snapshot: planned.backlog.snapshot,
        branch: planned.branch,
        issues: issues.map((issue) => Number(issue.id)),
      },
    );
  } else {
    const fresh = await loadPlannerInventory();
    for (const issue of issues) {
      const before = planned.inventory.find(
        (row) => rowIdentity(row) === issue.id,
      );
      const after = fresh.find((row) => rowIdentity(row) === issue.id);
      if (!before || !after || JSON.stringify(before) !== JSON.stringify(after))
        throw new Error(
          `Issue ${issue.id} changed after planning; refresh the plan before execution.`,
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function executeWorkflow() {
  await reassess(1, { kind: "startup" });
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

    // -------------------------------------------------------------------------
    // Phase 1: Plan
    //
    // The planning agent (opus, for deeper reasoning) reads the open issue list,
    // builds a dependency graph, and selects the issues that can be worked in
    // parallel right now (i.e., no blocking dependencies on other open issues).
    //
    // It outputs a <plan> JSON block — Output.object parses and validates it.
    // -------------------------------------------------------------------------
    const planned = await planNextBatch(iteration);
    const plan = planned.plan;
    await agentMap.recordPlan(iteration, plan);
    const issues = plan.issues;

    if (issues.length === 0) {
      if (planned.backlog?.snapshot.issues.length) {
        console.error(
          JSON.stringify(
            {
              head: planned.head,
              eligible: planned.backlog.eligible.map((issue) => issue.number),
              exclusions: planned.backlog.excluded.map(
                ({ kind, issue, reasons }) => ({
                  number: issue.number,
                  kind,
                  reasons,
                }),
              ),
              decisions: plan.decisions,
            },
            null,
            2,
          ),
        );
        if (
          planned.backlog.eligible.length ||
          planned.backlog.excluded.some(
            (issue) => issue.kind === "implementation",
          )
        )
          throw new Error(
            "No eligible batch selected while implementation issues remain. Resolve the recorded dependencies, holds or project qualification gates before resuming.",
          );
        const qualification = planned.backlog.excluded
          .filter((issue) => issue.kind === "qualification")
          .map((row) => row.issue.number);
        console.log(
          `Local implementation is complete; external qualification remains pending for: ${qualification.join(", ") || "none"}. Meta issues remain owned by their project workflow.`,
        );
        return;
      }
      console.log("No eligible work remains in the configured inventory.");
      return;
    }

    console.log(
      `Planning complete. ${issues.length} issue(s) to work in parallel:`,
    );
    for (const issue of issues) {
      console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
    }

    // -------------------------------------------------------------------------
    // Phase 2: Execute + Review
    //
    // For each issue, create a sandbox via createSandbox() so the implementer
    // and reviewer share the same sandbox instance per branch. The implementer
    // runs first; if it produces commits, the reviewer runs in the same sandbox.
    //
    // Promise.allSettled means one failing pipeline doesn't cancel the others.
    // -------------------------------------------------------------------------

    // Refresh once before parallel worktree creation; remote reads stay asynchronous.
    await admitPlanned(planned, issues);
    // Head the integration checkout must be at; advances after each merge.
    let integrationHead = planned.head;
    const assertBaseline = async () => {
      if (
        (await runHost("git", ["rev-parse", "HEAD"])).trim() !==
          integrationHead ||
        (await currentBranch()) !== planned.branch ||
        (await runHost("git", ["status", "--porcelain"])).trim()
      )
        throw new Error(
          "Integration checkout changed after planning; keep work and reconcile before merging.",
        );
    };
    await assertBaseline();
    const batchBaseSha = planned.head;

    // Per-branch mode: a FIFO queue integrates approved branches while other
    // pipelines continue in their own worktrees. With coalescing, one merger
    // takes every branch approved so far and runs the gate once for the group.
    const mergedIssues: typeof issues = [];
    const retainedMerges: { issue: (typeof issues)[number]; error: unknown }[] =
      [];
    let mergeStop: unknown;
    let mergeQueue = Promise.resolve();
    const pendingMerges: typeof issues = [];
    const integrateGroup = async (group: typeof issues): Promise<void> => {
      const before = integrationHead;
      try {
        await integrate(group);
        mergedIssues.push(...group);
      } catch (error) {
        // A merger that left the checkout untouched affects only these branches.
        const untouched =
          integrationHead === before &&
          (await runHost("git", ["rev-parse", "HEAD"])).trim() === before &&
          (await currentBranch()) === planned.branch &&
          !(await runHost("git", ["status", "--porcelain"])).trim();
        if (!untouched) {
          mergeStop = error;
          return;
        }
        if (group.length > 1) {
          // Find the failing branch: retry each half on its own.
          console.warn(
            `  ! merge of ${group.map((issue) => issue.id).join(", ")} failed; retrying in halves: ${error}`,
          );
          const half = Math.ceil(group.length / 2);
          await integrateGroup(group.slice(0, half));
          if (mergeStop === undefined) await integrateGroup(group.slice(half));
          return;
        }
        retainedMerges.push({ issue: group[0]!, error });
        console.warn(
          `  ! ${group[0]!.id} merge failed; branch retained: ${error}`,
        );
      }
    };
    const enqueueMerge = (issue: (typeof issues)[number]) => {
      pendingMerges.push(issue);
      mergeQueue = mergeQueue.then(async () => {
        if (mergeStop !== undefined) return;
        // An earlier coalesced merge may already have taken this branch.
        const group = MERGE_COALESCE
          ? pendingMerges.splice(0)
          : pendingMerges.splice(0, 1);
        if (group.length > 0) await integrateGroup(group);
      });
    };

    // Rolling schedule: when a pipeline settles, plan only the free slots.
    // Planning joins the merge queue, so it sees every merge before it and no
    // merger changes the integration checkout while the planner reads it.
    // Each issue starts from the integration head at its start; issues
    // started in this round are not planned again.
    const issueBases = new Map(issues.map((issue) => [issue.id, batchBaseSha]));
    const started = new Set(issues.map((issue) => issue.id));
    const finished = new Set<string>();
    const areas = new Map(
      plan.decisions.map((decision) => [decision.id, decision.likelyAreas]),
    );
    // Idle refill: the backlog as last planned, without started issues.
    // A new or unblocked issue changes it and lets free slots fill before
    // the next pipeline settles.
    const backlogSignature = (rows: readonly unknown[]) =>
      JSON.stringify(rows.filter((row) => !started.has(rowIdentity(row))));
    let plannedBacklog = backlogSignature(planned.inventory);
    const refill = (free: number) => {
      const planning = mergeQueue.then(() => planRefill(free));
      mergeQueue = planning.then(
        () => undefined,
        () => undefined,
      );
      return planning;
    };
    const planRefill = async (free: number) => {
      if (mergeStop !== undefined || breaker.open) return [];
      await assertBaseline();
      const next = await planNextBatch(iteration, {
        exclude: started,
        inProgress: issues
          .filter((issue) => !finished.has(issue.id))
          .map((issue) => ({
            ...issue,
            likelyAreas: areas.get(issue.id) ?? [],
          })),
        limit: free,
      });
      if (next.plan.issues.length > free)
        console.warn(
          `  Refill planned ${next.plan.issues.length} issue(s) for ${free} free slot(s); starting the first ${free}.`,
        );
      plannedBacklog = backlogSignature(next.inventory);
      const chosen = next.plan.issues.slice(0, free);
      for (const decision of next.plan.decisions)
        areas.set(decision.id, decision.likelyAreas);
      if (chosen.length === 0) return [];
      await admitPlanned(next, chosen);
      console.log(
        `Refill: ${chosen.length} issue(s) start from ${integrationHead.slice(0, 12)}:`,
      );
      for (const issue of chosen) {
        console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
        started.add(issue.id);
        issueBases.set(issue.id, integrationHead);
        issues.push(issue);
      }
      return chosen;
    };

    const rolling = await sandcastle.settleRolling(
      {
        issues: [...issues],
        concurrency: CONCURRENCY,
        refill: rollingSchedule() ? refill : undefined,
        idleRefill: {
          everyMs: IDLE_REFILL_MINUTES * 60_000,
          changed: async () =>
            backlogSignature(await eligibleBacklog()) !== plannedBacklog,
        },
        onSettle: (issue) => finished.add(issue.id),
      },
      async (issue) => {
        // The integration head this issue starts from (rolling: its start).
        const batchBaseSha = issueBases.get(issue.id)!;
        // Provider/infrastructure failures retry on the retained branch;
        // task failures (blocked, unapproved) are never retried.
        // Critique accepted on the first attempt; reused by retries.
        let approachCritique = "None.";
        let approachPlan: sandcastle.ApproachPlan | undefined;
        const result = await sandcastle.runTaskWithRetries({
          retries: TASK_RETRIES,
          breaker,
          onAttempt: (attempt) => {
            if (attempt.outcome !== "succeeded")
              console.warn(
                `  ! ${issue.id} attempt ${attempt.attempt} failed (${attempt.outcome}): ${attempt.error}`,
              );
          },
          run: async (attempt) => {
            let sandbox: sandcastle.Sandbox | undefined;
            try {
              // Include sandbox setup in the observed implementer phase.
              // One implementer invocation serves the first attempt and every
              // review repair round; findings are empty on the first attempt.
              const runImplementer = (
                logging: sandcastle.LoggingOption,
                reviewFindings: string,
                approach: { mode: "plan" | "implement"; critique: string } = {
                  mode: "implement",
                  critique: approachCritique,
                },
                stuckAdvice = "None.",
                checkpoint: {
                  progressCheck?: string;
                  pauseSignal?: AbortSignal;
                } = {},
              ) =>
                sandbox!.run({
                  logging,
                  name: "implementer",
                  maxIterations: 100,
                  agent: sandcastle.claudeCode("claude-sonnet-4-6"),
                  completionSignal: [
                    "<promise>COMPLETE</promise>",
                    "<promise>BLOCKED</promise>",
                  ],
                  promptFile: "./.sandcastle/implement-prompt.md",
                  promptArgs: {
                    TASK_ID: issue.id,
                    ISSUE_TITLE: issue.title,
                    BRANCH: issue.branch,
                    REVIEW_FINDINGS: reviewFindings,
                    APPROACH_MODE: approach.mode,
                    APPROACH_CRITIQUE: approach.critique,
                    STUCK_ADVICE: stuckAdvice,
                    PROGRESS_CHECK: checkpoint.progressCheck ?? "None.",
                  },
                  pauseSignal: checkpoint.pauseSignal,
                });
              const ensureSandbox = async () => {
                sandbox ??= await sandcastle.createSandbox({
                  branch: issue.branch,
                  baseBranch: batchBaseSha,
                  // A retained branch first takes in work integrated since.
                  mergeBase: true,
                  sandbox: docker({ env: trackerEnvironment }),
                  hooks,
                  copyToWorktree,
                });
              };
              // Every advisor run: a fresh worktree of the issue branch without tracker
              // credentials; any change to its checkout counts as a commit.
              const runAdvisorPrompt = async (
                logging: sandcastle.LoggingOption,
                promptFile: string,
                promptArgs: Record<string, string>,
              ) => {
                const advisorSandbox = await sandcastle.createSandbox({
                  branch: `sandcastle/advisor-${randomUUID()}`,
                  baseBranch: issue.branch,
                  sandbox: docker({ env: { ...readinessEnvironment } }),
                  copyToWorktree: [],
                });
                try {
                  const run = await advisorSandbox.run({
                    logging,
                    name: "advisor",
                    maxIterations: 1,
                    agent: advisorAgent(),
                    promptFile,
                    promptArgs,
                  });
                  const status = await advisorSandbox.exec(
                    "git status --porcelain --untracked-files=all",
                  );
                  return status.stdout.trim()
                    ? {
                        ...run,
                        commits: [
                          ...run.commits,
                          { sha: "uncommitted-advisor-changes" },
                        ],
                      }
                    : run;
                } finally {
                  await advisorSandbox.close();
                }
              };
              // Stuck advisor: diagnose a stalled implementation and give the
              // implementer a bounded number of advised attempts.
              const consultStuck = async <T extends unknown>(
                trigger: sandcastle.StuckTrigger,
                log: string,
                findings: string,
                retry: (
                  advice: sandcastle.StuckAdvice,
                  n: number,
                ) => Promise<{ resolved: boolean; value: T }>,
              ) => {
                const taskBody = await issueBody(issue.id);
                const stuck = await sandcastle.adviseWhenStuck({
                  trigger,
                  attempts: ADVISOR_STUCK_ATTEMPTS,
                  budget: advisorBudget,
                  retry,
                  advise: (n) =>
                    agentMap.track(
                      {
                        batch: iteration,
                        role: "advisor",
                        issueId: issue.id,
                        title: `${issue.title} (stuck ${n}: ${trigger})`,
                        branch: issue.branch,
                      },
                      async (logging) => {
                        // Read the implementer's current state, including uncommitted work.
                        const diff = await sandbox!.exec(
                          `git diff ${batchBaseSha}`,
                        );
                        const status = await sandbox!.exec(
                          "git status --porcelain --untracked-files=all",
                        );
                        return sandcastle.withStuckAdvice(
                          runAdvisorPrompt(
                            logging,
                            "./.sandcastle/stuck-advisor-prompt.md",
                            {
                              TASK_ID: issue.id,
                              ISSUE_TITLE: issue.title,
                              TASK_BODY: taskBody,
                              STUCK_TRIGGER: trigger,
                              STUCK_DIFF:
                                diff.stdout.slice(-60_000) || "No changes.",
                              STUCK_STATUS:
                                status.stdout.slice(0, 10_000) || "Clean.",
                              STUCK_LOG: log.slice(-8_000) || "No output.",
                              STUCK_FINDINGS: findings || "None.",
                            },
                          ),
                        );
                      },
                    ),
                });
                console.log(
                  `  ${issue.id} stuck advisor (${trigger}): ${stuck.outcome}`,
                );
                return stuck;
              };
              const stuckReport = (stuck: {
                advice?: sandcastle.StuckAdvice;
                error?: string;
              }) =>
                stuck.advice
                  ? `\nAdvisor diagnosis:\n${sandcastle.formatStuckAdvice(stuck.advice)}`
                  : stuck.error
                    ? `\nAdvisor: ${stuck.error}`
                    : "";
              // Approach critique: the implementer writes a brief in plan mode and
              // the advisor critiques it, before any code change. Retries reuse
              // the first attempt's outcome.
              const approachWanted =
                attempt === 1 &&
                ADVISOR_APPROACH !== "off" &&
                (ADVISOR_APPROACH === "all" ||
                  (await issueLabels(issue.id)).includes(
                    ADVISOR_HIGH_RISK_LABEL,
                  ));
              if (approachWanted) {
                const taskBody = await issueBody(issue.id);
                const runAdvisor = (
                  logging: sandcastle.LoggingOption,
                  plan: sandcastle.ApproachPlan,
                  round: number,
                ) =>
                  runAdvisorPrompt(
                    logging,
                    "./.sandcastle/approach-critique-prompt.md",
                    {
                      TASK_ID: issue.id,
                      ISSUE_TITLE: issue.title,
                      TASK_BODY: taskBody,
                      APPROACH_PLAN: sandcastle.formatApproachPlan(plan),
                      APPROACH_ROUND: String(round),
                    },
                  );
                const approach = await sandcastle.runApproachCritique({
                  rounds: ADVISOR_APPROACH_ROUNDS,
                  budget: advisorBudget,
                  plan: (round, previous) =>
                    agentMap.track(
                      {
                        batch: iteration,
                        role: "implementer",
                        issueId: issue.id,
                        title: `${issue.title} (approach ${round})`,
                        branch: issue.branch,
                      },
                      async (logging) => {
                        await ensureSandbox();
                        const run = await runImplementer(logging, "", {
                          mode: "plan",
                          critique: previous
                            ? sandcastle.formatApproachCritique(previous)
                            : "None.",
                        });
                        // A plan-mode run must not change the repository.
                        const status = await sandbox!.exec(
                          "git status --porcelain --untracked-files=all",
                        );
                        return status.stdout.trim()
                          ? {
                              ...run,
                              commits: [
                                ...run.commits,
                                { sha: "uncommitted-plan-changes" },
                              ],
                            }
                          : run;
                      },
                    ),
                  critique: (round, plan) =>
                    agentMap.track(
                      {
                        batch: iteration,
                        role: "advisor",
                        issueId: issue.id,
                        title: `${issue.title} (approach critique ${round})`,
                        branch: issue.branch,
                      },
                      (logging) =>
                        sandcastle.withApproachCritique(
                          runAdvisor(logging, plan, round),
                        ),
                    ),
                });
                console.log(
                  `  ${issue.id} approach ${approach.outcome}${approach.reason ? ` (${approach.reason})` : ""}: concerns accepted ${approach.counts.accepted}, disputed ${approach.counts.disputed}`,
                );
                if (approach.outcome === "escalate")
                  throw new Error(
                    `Approach escalated for issue ${issue.id} (${approach.reason}); branch retained for the owner.\n` +
                      (approach.critique
                        ? sandcastle.formatApproachCritique(approach.critique)
                        : (approach.rounds.at(-1)?.error ?? "")),
                  );
                if (approach.critique)
                  approachCritique = sandcastle.formatApproachCritique(
                    approach.critique,
                  );
                approachPlan = approach.plan;
              }
              // Progress checkpoints: run the implementer in pausable segments;
              // the advisor checks progress at time and drift signals.
              const runCheckpointed = async (
                logging: sandcastle.LoggingOption,
              ) => {
                const budget = sandcastle.checkpointBudget({
                  plan: approachPlan,
                  labels: approachPlan ? [] : await issueLabels(issue.id),
                  defaults: ADVISOR_CHECKPOINT.defaults,
                  factor: ADVISOR_CHECKPOINT.factor,
                });
                const taskBody = await issueBody(issue.id);
                // Observe the implementer's stream: error lines for drift,
                // a narrative tail for the advisor.
                const errorLines: string[] = [];
                const narrative: string[] = [];
                const observed: sandcastle.LoggingOption =
                  logging.type === "file"
                    ? {
                        ...logging,
                        onAgentStreamEvent: (event) => {
                          logging.onAgentStreamEvent?.(event);
                          if (event.type === "raw")
                            errorLines.push(
                              ...sandcastle.errorLinesOf(event.line),
                            );
                          else {
                            narrative.push(
                              event.type === "text"
                                ? event.message
                                : `${event.name}: ${event.formattedArgs}`,
                            );
                            if (narrative.length > 200) narrative.shift();
                          }
                        },
                      }
                    : logging;
                const segmentOf = (
                  run: (
                    pauseSignal: AbortSignal,
                  ) => Promise<Awaited<ReturnType<typeof runImplementer>>>,
                ) => {
                  const controller = new AbortController();
                  return {
                    result: run(controller.signal),
                    pause: () => controller.abort(),
                  };
                };
                const fresh = (progressCheck: string) =>
                  segmentOf((pauseSignal) =>
                    runImplementer(observed, "", undefined, "None.", {
                      progressCheck,
                      pauseSignal,
                    }),
                  );
                const checkpointed = await sandcastle.runWithCheckpoints({
                  budgetMinutes: budget.budgetMinutes,
                  fractions: ADVISOR_CHECKPOINT.fractions,
                  max: ADVISOR_CHECKPOINT.max,
                  budget: advisorBudget,
                  detector: sandcastle.createDriftDetector({
                    briefFiles: approachPlan?.files,
                    repeatThreshold: ADVISOR_CHECKPOINT.repeatThreshold,
                    ignore: ADVISOR_CHECKPOINT.ignore,
                    diffLimit: sandcastle.diffLineLimit(
                      budget.size,
                      ADVISOR_CHECKPOINT.factor,
                    ),
                  }),
                  start: () => fresh("None."),
                  // Committed and uncommitted changes since the branch's merge
                  // base with the batch base, so a retained branch that could not
                  // take the newer base does not count the base's own changes
                  // (they show as deletions against it). Read without optional
                  // locks so the running implementer's own git commands never
                  // meet a held index.lock.
                  snapshot: async () => {
                    const numstat = await sandbox!.exec(
                      `export GIT_OPTIONAL_LOCKS=0; git diff --numstat "$(git merge-base ${batchBaseSha} HEAD 2>/dev/null || echo ${batchBaseSha})" && git ls-files --others --exclude-standard | while IFS= read -r f; do if grep -Iq . "$f" 2>/dev/null || [ ! -s "$f" ]; then printf '%s\t0\t%s\n' "$(wc -l < "$f" | tr -d ' ')" "$f"; else printf -- '-\t-\t%s\n' "$f"; fi; done`,
                    );
                    if (numstat.exitCode !== 0)
                      throw new Error("progress snapshot failed");
                    return {
                      files: sandcastle.parseNumstat(numstat.stdout),
                      log: errorLines.map((line) => `${line}\n`).join(""),
                    };
                  },
                  check: (n, signal, progress) =>
                    agentMap.track(
                      {
                        batch: iteration,
                        role: "advisor",
                        issueId: issue.id,
                        title: `${issue.title} (checkpoint ${n}: ${signal.kind})`,
                        branch: issue.branch,
                      },
                      async (advisorLogging) => {
                        // The paused implementer's state, including uncommitted work.
                        const diff = await sandbox!.exec(
                          `git diff ${batchBaseSha}`,
                        );
                        const status = await sandbox!.exec(
                          "git status --porcelain --untracked-files=all",
                        );
                        return sandcastle.withProgressCheck(
                          runAdvisorPrompt(
                            advisorLogging,
                            "./.sandcastle/progress-check-prompt.md",
                            {
                              TASK_ID: issue.id,
                              ISSUE_TITLE: issue.title,
                              TASK_BODY: taskBody,
                              APPROACH_PLAN: approachPlan
                                ? sandcastle.formatApproachPlan(approachPlan)
                                : "No approach brief.",
                              CHECKPOINT_NUMBER: String(n),
                              CHECKPOINT_SIGNAL: `${signal.kind}: ${signal.detail}`,
                              ELAPSED_MINUTES: String(
                                Math.round(progress.elapsedMinutes),
                              ),
                              BUDGET_MINUTES: String(
                                Math.round(progress.budgetMinutes),
                              ),
                              PROGRESS_DIFF:
                                diff.stdout.slice(-60_000) || "No changes.",
                              PROGRESS_STATUS:
                                status.stdout.slice(0, 10_000) || "Clean.",
                              PROGRESS_LOG:
                                narrative.join("\n").slice(-8_000) ||
                                "No output.",
                            },
                          ),
                          signal,
                        );
                      },
                    ),
                  // Same session when the provider can resume; else a fresh
                  // attempt on the same worktree with the check as input.
                  resume: (paused, check) => {
                    const progressCheck = sandcastle.formatProgressCheck(check);
                    if (!paused.resume)
                      return { mode: "fresh", segment: fresh(progressCheck) };
                    return {
                      mode: "session",
                      segment: segmentOf(async (pauseSignal) => {
                        let resumed: Awaited<
                          ReturnType<NonNullable<typeof paused.resume>>
                        >;
                        try {
                          resumed = await paused.resume!(
                            [
                              "A progress checkpoint paused you so the advisor could check your work against the task and approach.",
                              progressCheck,
                              "Continue from the current worktree; your uncommitted changes are intact. Follow the direction, or write `Disputed direction:` with your reason and continue your approach. Finish with the completion signal from your instructions.",
                            ].join("\n\n"),
                            { logging: observed, pauseSignal },
                          );
                        } catch (error) {
                          // The provider could not reopen the session (for example
                          // Codex `thread/resume` on a compacted session): continue
                          // fresh on the same worktree with the check as input.
                          console.warn(
                            `  ! ${issue.id} session resume failed; continuing fresh: ${String(error).split("\n").slice(0, 2).join(" ")}`,
                          );
                          return runImplementer(
                            observed,
                            "",
                            undefined,
                            "None.",
                            {
                              progressCheck,
                              pauseSignal,
                            },
                          );
                        }
                        // A resume is one iteration; continue fresh if unfinished.
                        if (resumed.paused || resumed.completionSignal)
                          return resumed;
                        const rest = await runImplementer(
                          observed,
                          "",
                          undefined,
                          "None.",
                          { progressCheck, pauseSignal },
                        );
                        return {
                          ...rest,
                          stdout: resumed.stdout + rest.stdout,
                          commits: [...resumed.commits, ...rest.commits],
                        };
                      }),
                    };
                  },
                });
                const record = {
                  estimateMinutes: budget.estimateMinutes,
                  budgetMinutes: budget.budgetMinutes,
                  elapsedMinutes: checkpointed.elapsedMinutes,
                  source: budget.source,
                  outcome: checkpointed.outcome,
                  // The implementer may dispute direction with a reason.
                  disputed: checkpointed.stdout.includes("Disputed direction:"),
                  checkpoints: checkpointed.checkpoints.map((c) => ({
                    signal: c.signal.kind,
                    verdict:
                      c.check?.verdict ?? (c.skipped ? "skipped" : "invalid"),
                    resumed: c.resumed,
                  })),
                };
                console.log(
                  `  ${issue.id} checkpoints ${checkpointed.outcome}: estimate ${budget.estimateMinutes} min (${budget.source}), budget ${budget.budgetMinutes}, actual ${checkpointed.elapsedMinutes}; ${record.checkpoints.map((c) => `${c.signal}=${c.verdict}${c.resumed ? `/${c.resumed}` : ""}`).join(", ") || "none"}`,
                );
                if (checkpointed.outcome !== "completed") {
                  const last = checkpointed.checkpoints.at(-1);
                  throw new Error(
                    `Progress checkpoint ${checkpointed.outcome} for issue ${issue.id}; retain the branch and leave its issue open.` +
                      (last?.check
                        ? `\nAdvisor assessment:\n${sandcastle.formatProgressCheck(last.check)}`
                        : checkpointed.error
                          ? `\nAdvisor: ${checkpointed.error}`
                          : ""),
                  );
                }
                return {
                  ...checkpointed.result,
                  stdout: checkpointed.stdout,
                  commits: [...checkpointed.commits],
                  progress: record,
                };
              };
              let implement:
                | Awaited<ReturnType<typeof runImplementer>>
                | undefined;
              let stalled:
                | { trigger: sandcastle.StuckTrigger; log: string }
                | undefined;
              try {
                implement = await agentMap.track(
                  {
                    batch: iteration,
                    role: "implementer",
                    issueId: issue.id,
                    title:
                      attempt === 1
                        ? issue.title
                        : `${issue.title} (retry ${attempt})`,
                    branch: issue.branch,
                  },
                  async (logging) => {
                    await ensureSandbox();
                    return ADVISOR_CHECKPOINT.mode === "on"
                      ? runCheckpointed(logging)
                      : runImplementer(logging, "");
                  },
                );
              } catch (error) {
                // Without the stuck advisor an idle timeout fails as before.
                if (
                  ADVISOR_STUCK !== "on" ||
                  !sandbox ||
                  !sandcastle.isIdleTimeout(error)
                )
                  throw error;
                stalled = {
                  trigger: "idle-timeout",
                  log: sandcastle.describeFailure(error),
                };
              }
              if (
                !stalled &&
                ADVISOR_STUCK === "on" &&
                implement!.completionSignal !== "<promise>COMPLETE</promise>"
              )
                stalled = {
                  trigger: "implementation-incomplete",
                  log: implement!.stdout,
                };
              if (stalled) {
                const trigger = stalled.trigger;
                const stuck = await consultStuck(
                  trigger,
                  stalled.log,
                  "",
                  async (advice, n) => {
                    const run = await agentMap.track(
                      {
                        batch: iteration,
                        role: "implementer",
                        issueId: issue.id,
                        title: `${issue.title} (advised ${n})`,
                        branch: issue.branch,
                      },
                      (logging) =>
                        runImplementer(
                          logging,
                          "",
                          undefined,
                          sandcastle.formatStuckAdvice(advice),
                        ),
                    );
                    implement = run;
                    return {
                      resolved:
                        run.completionSignal === "<promise>COMPLETE</promise>",
                      value: run,
                    };
                  },
                );
                if (stuck.outcome === "escalated")
                  await handToOwner(
                    issue.id,
                    `Sandcastle stopped: implementation stalled (${trigger}) and the stuck advisor escalated it to the owner. The branch is retained.${stuckReport(stuck)}`,
                  );
                if (stuck.outcome !== "resolved")
                  throw new Error(
                    `Implementation stalled for issue ${issue.id} (${trigger}; advisor ${stuck.outcome}); retain the branch and leave its issue open.${stuckReport(stuck)}`,
                  );
              }
              if (implement!.completionSignal !== "<promise>COMPLETE</promise>")
                throw new Error(
                  `Implementation did not complete for issue ${issue.id}; retain the branch and leave its issue open.`,
                );
              const implementationCommits =
                implement!.commits.length > 0
                  ? implement!.commits
                  : (
                      await runHost("git", [
                        "rev-list",
                        `${batchBaseSha}..${issue.branch}`,
                        "--",
                      ])
                    )
                      .trim()
                      .split("\n")
                      .filter(Boolean)
                      .map((sha) => ({ sha }));
              // Retained commits still require a fresh completed review before merging.
              if (sandbox && implementationCommits.length > 0) {
                // Bounded review→repair loop: only an approved verdict is merged.
                const reviewPolicy = {
                  sweepFrom: REVIEW_SWEEP_FROM,
                  roundCap: REVIEW_ROUND_CAP,
                  repeatLimit: REVIEW_REPEAT_LIMIT,
                };
                const escalateReview = async (
                  round: sandcastle.ReviewRound,
                ): Promise<"continue" | "escalate"> => {
                  const history = reviewHistory.record(issue.id, round);
                  const escalation = sandcastle.reviewEscalation(
                    history,
                    reviewPolicy,
                  );
                  if (!escalation) return "continue";
                  reviewHistory.markEscalated(issue.id);
                  console.warn(
                    `Review escalated for issue ${issue.id} (${escalation.reason} after ${escalation.openRounds} round(s)); branch retained for the owner.`,
                  );
                  try {
                    await runHost("gh", [
                      "issue",
                      "edit",
                      issue.id,
                      "--add-label",
                      OWNER_LABEL,
                    ]);
                    await runHost(
                      "gh",
                      ["issue", "comment", issue.id, "--body-file", "-"],
                      {
                        input: sandcastle.reviewEscalationComment(
                          escalation,
                          round.summary,
                        ),
                      },
                    );
                  } catch (error) {
                    console.warn(
                      `  ! could not hand issue ${issue.id} to the owner: ${error}`,
                    );
                  }
                  return "escalate";
                };
                const reviewLoop = () => {
                  const priorRounds = sandcastle.openReviewRounds(
                    reviewHistory.read(issue.id),
                  ).length;
                  return sandcastle.runReviewLoop({
                    maxRepairRounds: MAX_REPAIR_ROUNDS,
                    onVerdict: escalateReview,
                    review: (round) => {
                      const openRound = priorRounds + round;
                      const sweep = sandcastle.isSweepRound(
                        openRound,
                        reviewPolicy,
                      );
                      // Raises the configured effort for sweep rounds where the provider accepts it.
                      const reviewerEffort = sweep
                        ? REVIEW_SWEEP_EFFORT
                        : undefined;
                      return agentMap.track(
                        {
                          batch: iteration,
                          role: "reviewer",
                          issueId: issue.id,
                          title:
                            openRound === 1
                              ? issue.title
                              : `${issue.title} (re-review ${openRound}${reviewerEffort ? `, sweep at ${reviewerEffort}` : ""})`,
                          branch: issue.branch,
                        },
                        (logging) =>
                          sandcastle.withReviewVerdict(
                            sandbox!.run({
                              logging,
                              name: "reviewer",
                              maxIterations: 1,
                              agent: sandcastle.claudeCode("claude-sonnet-4-6"),
                              completionSignal: [
                                "<promise>COMPLETE</promise>",
                                "<promise>BLOCKED</promise>",
                              ],
                              promptFile: "./.sandcastle/review-prompt.md",
                              promptArgs: {
                                TASK_ID: issue.id,
                                ISSUE_TITLE: issue.title,
                                BRANCH: issue.branch,
                                REVIEW_BASE_SHA: batchBaseSha,
                                REVIEW_ROUND: String(openRound),
                                REVIEW_REPAIR_ROUNDS: String(MAX_REPAIR_ROUNDS),
                                REVIEW_MODE: sweep ? "sweep" : "standard",
                                PREVIOUS_FINDINGS:
                                  sandcastle.formatPreviousFindings(
                                    reviewHistory.read(issue.id),
                                  ),
                              },
                            }),
                          ),
                      );
                    },
                    repair: (findings, round) =>
                      agentMap.track(
                        {
                          batch: iteration,
                          role: "implementer",
                          issueId: issue.id,
                          title: `${issue.title} (repair ${round})`,
                          branch: issue.branch,
                        },
                        (logging) =>
                          runImplementer(
                            logging,
                            sandcastle.formatReviewFindings(findings),
                          ),
                      ),
                  });
                };
                const reviewCommits: { sha: string }[] = [];
                let loop = await reviewLoop();
                reviewCommits.push(...loop.commits);
                if (
                  loop.outcome === "changes-requested" &&
                  ADVISOR_STUCK === "on"
                ) {
                  const findings = sandcastle.formatReviewFindings(
                    loop.findings,
                  );
                  const stuck = await consultStuck(
                    "review-budget-exhausted",
                    loop.last.stdout,
                    findings,
                    async (advice, n) => {
                      const run = await agentMap.track(
                        {
                          batch: iteration,
                          role: "implementer",
                          issueId: issue.id,
                          title: `${issue.title} (advised ${n})`,
                          branch: issue.branch,
                        },
                        (logging) =>
                          runImplementer(
                            logging,
                            findings,
                            undefined,
                            sandcastle.formatStuckAdvice(advice),
                          ),
                      );
                      reviewCommits.push(...run.commits);
                      if (
                        run.completionSignal !== "<promise>COMPLETE</promise>"
                      )
                        return { resolved: false, value: loop };
                      // An advised repair goes through the normal review loop again.
                      loop = await reviewLoop();
                      reviewCommits.push(...loop.commits);
                      return {
                        resolved: loop.outcome === "approved",
                        value: loop,
                      };
                    },
                  );
                  if (stuck.outcome === "escalated") {
                    reviewHistory.markEscalated(issue.id);
                    await handToOwner(
                      issue.id,
                      `Sandcastle stopped: the review is still unapproved and the stuck advisor escalated it to the owner. The branch is retained.${stuckReport(stuck)}`,
                    );
                  }
                  if (stuck.outcome !== "resolved")
                    console.warn(
                      `  ! ${issue.id} review still unapproved after the advisor (${stuck.outcome}).${stuckReport(stuck)}`,
                    );
                }
                if (loop.outcome !== "approved")
                  console.warn(
                    `  ! ${issue.id} review ${loop.outcome} after ${loop.rounds.length} round(s); branch retained.\n` +
                      (sandcastle.formatReviewFindings(loop.findings) ||
                        loop.rounds.at(-1)?.error ||
                        ""),
                  );

                // Merge commits from every run so the merge phase sees all of them.
                // Each sandbox.run() only returns commits from its own run.
                return {
                  ...loop.last,
                  completionSignal:
                    loop.outcome === "approved"
                      ? "<promise>COMPLETE</promise>"
                      : "<promise>BLOCKED</promise>",
                  commits: [...implementationCommits, ...reviewCommits],
                };
              }

              return implement!;
            } finally {
              await sandbox?.close();
            }
          },
        });
        if (
          MERGE_MODE === "per-branch" &&
          result.commits.length > 0 &&
          result.completionSignal === "<promise>COMPLETE</promise>"
        )
          enqueueMerge(issue);
        return result;
      },
    );
    if (rolling.refillError !== undefined)
      console.warn(`  ! Rolling refill stopped: ${rolling.refillError}`);
    // Aligned with `issues`, which refills extend in start order.
    const settled = rolling.settled;

    // Log any agents that threw (network error, sandbox crash, etc.).
    for (const [i, outcome] of settled.entries()) {
      if (outcome.status === "rejected") {
        console.error(
          `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
        );
      }
    }

    if (breaker.open) {
      await agentMap.finishBatch(iteration);
      throw new Error(
        `Provider unavailable after ${breaker.consecutiveProviderFailures} consecutive provider failures; branches are retained. Check provider status, authentication and fallbacks, then resume.`,
      );
    }

    // Planning waits for every pipeline and the merge queue to settle.
    await mergeQueue;
    if (mergeStop !== undefined) throw mergeStop;

    // Only pass branches that actually produced commits to the merge phase.
    // An agent that ran successfully but made no commits has nothing to merge.
    const completedIssues = settled
      .map((outcome, i) => ({ outcome, issue: issues[i]! }))
      .filter(
        (entry) =>
          entry.outcome.status === "fulfilled" &&
          entry.outcome.value.commits.length > 0 &&
          entry.outcome.value.completionSignal ===
            "<promise>COMPLETE</promise>",
      )
      .map((entry) => entry.issue);

    const completedBranches = completedIssues.map((i) => i.branch);

    console.log(
      `\nExecution complete. ${completedBranches.length} branch(es) with commits:`,
    );
    for (const branch of completedBranches) {
      console.log(`  ${branch}`);
    }

    if (
      completedBranches.length === 0 ||
      (MERGE_MODE === "per-branch" && mergedIssues.length === 0)
    ) {
      await agentMap.finishBatch(iteration);
      throw new Error(
        "No verified implementation progress. Retain the branches and inspect failed or blocked stages before resuming.",
      );
    }

    if (MERGE_MODE === "batch") await integrate(completedIssues);

    // Integrate approved branches on the integration checkout. Guards: the
    // checkout is at the expected head and clean before the merger starts; the
    // merger must leave a clean, advanced head containing every branch; then
    // post-merge readiness/verification runs for exactly these branches.
    // Declared (hoisted) so the per-branch queue can call it while pipelines
    // run; kept after the pipelines so generated-profile anchors stay ordered.
    async function integrate(mergeIssues: typeof issues) {
      await assertBaseline();
      const base = integrationHead;
      const mergeBranches = mergeIssues.map((i) => i.branch);

      // -------------------------------------------------------------------------
      // Phase 3: Merge
      //
      // One agent merges all completed branches into the current branch,
      // resolving any conflicts and running tests to confirm everything works.
      //
      // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
      // uses to know which branches to merge and which issues to close.
      // -------------------------------------------------------------------------
      const ids = mergeIssues.map((i) => i.id).join(", ");
      // With a scripted gate, a repair run receives the failing gate's output.
      const runMerger = (gateFailure: string) =>
        agentMap.track(
          {
            batch: iteration,
            role: "merger",
            title: gateFailure
              ? `Repair gate for ${ids}`
              : MERGE_MODE === "batch"
                ? "Integrate batch"
                : `Integrate ${ids}`,
            branch: planned.branch,
          },
          (logging) =>
            sandcastle.run({
              logging,
              hooks: gateHooks,
              sandbox: docker({ env: gateEnvironment }),
              name: "merger",
              maxIterations: 1,
              agent: sandcastle.claudeCode("claude-sonnet-4-6"),
              completionSignal: [
                "<promise>COMPLETE</promise>",
                "<promise>BLOCKED</promise>",
              ],
              promptFile: "./.sandcastle/merge-prompt.md",
              promptArgs: {
                // A markdown list of branch names, one per line.
                BRANCHES: mergeBranches.map((b) => `- ${b}`).join("\n"),
                // A markdown list of issue IDs and titles, one per line.
                ISSUES: mergeIssues
                  .map((i) => `- ${i.id}: ${i.title}`)
                  .join("\n"),
                // The integration commit before any branch in this batch is merged.
                BATCH_BASE_SHA: base,
                ...(MERGE_GATE ? { GATE_FAILURE: gateFailure } : {}),
              },
            }),
        );
      // The merger must leave a clean, advanced head containing every branch.
      const checkIntegrated = async (run: { completionSignal?: string }) => {
        if (run.completionSignal !== "<promise>COMPLETE</promise>") {
          throw new Error(
            "Merge did not complete; readiness and the next planner are stopped",
          );
        }
        const head = (await runHost("git", ["rev-parse", "HEAD"])).trim();
        if (
          head === base ||
          (await currentBranch()) !== planned.branch ||
          (await runHost("git", ["status", "--porcelain"])).trim()
        )
          throw new Error(
            "Merger did not produce a clean integrated checkout on the planned branch.",
          );
        for (const ref of [base, ...mergeBranches])
          await runHost("git", ["merge-base", "--is-ancestor", ref, head]);
        return head;
      };
      // The gate command runs in place of a model; it prints its own verdict.
      const runGate = (head: string) =>
        agentMap.track(
          {
            batch: iteration,
            role: "merger",
            title: `Gate ${ids} at ${head.slice(0, 8)}`,
            branch: planned.branch,
          },
          (logging) =>
            sandcastle.run({
              logging,
              hooks: gateHooks,
              sandbox: docker({ env: gateEnvironment }), // scripted gate
              name: "gate",
              maxIterations: 1,
              // Integration suites can stay quiet for a long time.
              idleTimeoutSeconds: 60 * 60,
              agent: sandcastle.command(
                `( ${MERGE_GATE!.command.replaceAll("{{BATCH_BASE_SHA}}", base)} ) 2>&1 && echo '<promise>GATE PASSED</promise>' || echo '<promise>GATE FAILED</promise>'`,
              ),
              prompt: "Scripted cumulative gate",
              completionSignal: [
                "<promise>GATE PASSED</promise>",
                "<promise>GATE FAILED</promise>",
              ],
            }),
        );

      const merge = await runMerger("");
      let integratedHead = await checkIntegrated(merge);
      if (MERGE_GATE) {
        for (let repairs = 0; ; repairs++) {
          const gate = await runGate(integratedHead);
          const output = gate.stdout.split("\n").slice(-200).join("\n");
          if (gate.completionSignal === "<promise>GATE PASSED</promise>") break;
          if (repairs >= MERGE_GATE.repairs)
            throw new Error(
              `Cumulative gate failed at ${integratedHead}:\n${output}`,
            );
          console.log(
            `  ! gate failed for ${ids}; merger repair ${repairs + 1}`,
          );
          integratedHead = await checkIntegrated(await runMerger(output));
        }
        for (const issue of mergeIssues)
          await runHost("gh", [
            "issue",
            "close",
            issue.id,
            "--comment",
            `Integrated into \`${planned.branch}\` at ${integratedHead}. Cumulative gate passed: \`${MERGE_GATE.command.replaceAll("{{BATCH_BASE_SHA}}", base)}\`.`,
          ]);
      }
      await reassess(iteration, {
        kind: "post-merge",
        base,
        branches: mergeBranches,
        issues: mergeIssues.map((issue) => Number(issue.id)),
        // checkIntegrated accepted only a completed merge.
        completionSignal: "<promise>COMPLETE</promise>",
      });
      integrationHead = integratedHead;
      // continuous.mts publishes (and may merge) this commit. Print it only
      // when a cumulative gate ran and passed on it.
      if (MERGE_GATE) console.log(`Gated integration head ${integratedHead}`);
    }
    await agentMap.finishBatch(iteration);

    console.log("\nBranches merged.");
  }

  if (
    readinessEnabled &&
    (
      await sandcastle.inspectGitHubReadinessBacklog({
        ...readiness,
        repository: readiness.repository!,
        cwd: process.cwd(),
      })
    ).snapshot.issues.length === 0
  )
    return;
  throw new Error(
    "Iteration limit reached; inspect the remaining backlog before starting another run.",
  );
}

try {
  await executeWorkflow();
  await agentMap.finish("completed");
} catch (error) {
  await agentMap.finish("failed");
  throw error;
}
