---
"@ai-hero/sandcastle": minor
---

Add `advisor.checkpoint.ignore`: globs of files every drift signal skips.
Projects that require ledgers, receipts or screenshots as evidence list them
here so that evidence no longer counts toward `diff-size` (or `outside-brief`
and `churn`), and a diligent implementer is not paused as drifting.
