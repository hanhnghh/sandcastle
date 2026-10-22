---
"@ai-hero/sandcastle": minor
---

Per-branch merge can coalesce: `merge.coalesce` lets one merger integrate every
branch approved while the previous merge ran, with one cumulative gate, and a
failed group is retried in halves to isolate the failing branch. The merge
prompt restores the checkout to the batch base before reporting BLOCKED so
these retries are safe. `merge.testWorkers` exports `SANDCASTLE_TEST_WORKERS`
to the merger's gate only and, above 1, runs the project's
`.sandcastle/scripts/test-isolation.sh <workers>` first to provision isolated
test resources.
