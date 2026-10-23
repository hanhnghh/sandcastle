---
"@ai-hero/sandcastle": patch
---

Merging the base into a retained branch is now the explicit `mergeBase` option
of `createSandbox` (and `WorktreeManager.create`), and it also applies when an
existing branch gets a new worktree, not only when a worktree is reused.
Without `mergeBase`, `baseBranch` again only forks new branches, as documented.
The parallel-planner-with-review template sets it for issue sandboxes.
