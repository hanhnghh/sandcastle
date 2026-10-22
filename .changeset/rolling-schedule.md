---
"@ai-hero/sandcastle": minor
---

Add a rolling schedule for `parallel-planner-with-review` with per-branch merge.
With `"schedule": "rolling"` in `workflow.json`, a settled pipeline frees its
slot for new work at once: the planner runs again for the free slots, told
which issues are still in progress and their likely areas, while the other
pipelines keep running. Refill planning is serialized with the merge queue, and
each refilled issue starts from the current integration head. A plan may now
record `parallel-conflict` against an in-progress issue. `settleRolling` is
exported for host automation. The default batch schedule is unchanged.
