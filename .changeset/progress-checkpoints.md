---
"@ai-hero/sandcastle": minor
---

Add progress checkpoints (`advisor.checkpoint.mode: "on"`). The implementer
runs against a budget from the approach brief's estimate (or per-label
defaults) times `factor`; time checkpoints at 50% and 100% and drift signals
(files outside the brief, a repeated error, edit–revert churn, an oversized
diff) pause it for a read-only advisor check. `continue` and `redirect` resume
the same session, or a fresh attempt on the same worktree when the provider
cannot resume; `stop`, malformed checks and the checkpoint cap retain the
branch and report the assessment. Agent Map records each check and the
estimate against the actual time.

`sandbox.run()` gains `pauseSignal`: it stops the agent's whole process group
in the sandbox and resolves with `paused: true`, keeping its session, commits
and uncommitted changes for `.resume()`. `.resume()` and `.fork()` no longer
inherit the original `promptArgs`, which made resuming a `promptFile` run with
arguments fail.
