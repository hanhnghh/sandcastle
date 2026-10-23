---
"@ai-hero/sandcastle": minor
---

`settleRolling` takes `idleRefill: { everyMs, changed }`. While slots are free
and items still run, it asks `changed()` every `everyMs` and refills when it
says the backlog changed, instead of waiting for the next settle. The rolling
template checks every 15 minutes whether the planner's eligible backlog differs
from the one it last planned (a new, unblocked or released issue), so such an
issue starts without waiting for a running pipeline to finish.
