---
"@ai-hero/sandcastle": patch
---

The repeated-error checkpoint signal no longer counts test-runner tallies
("1 failed", "Tests  2 failed | 10 passed", "Failed Tests 3"). They repeat on
every run that still has a failing test, so batch red/green work paused the
implementer as drifting; the error lines under them still count.
