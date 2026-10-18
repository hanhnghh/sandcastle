---
"@ai-hero/sandcastle": minor
---

Add an optional advisor role that critiques the implementation approach before
code is written. With `roles.advisor` configured and `advisor.approach` set to
`high-risk` or `all`, the implementer first writes an approach brief (including
a size and time estimate) in plan mode; the advisor, read-only and without
tracker credentials, returns `proceed`, `revise` or `escalate`. Revisions must
answer every concern (accepted or disputed with a reason) within a round
budget; escalation, malformed output or any repository change retains the
branch for the owner. Agent Map records advisor critiques. Defaults are off.
