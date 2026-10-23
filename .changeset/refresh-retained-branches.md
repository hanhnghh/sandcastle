---
"@ai-hero/sandcastle": patch
---

A branch retained from an earlier attempt is brought up to the requested base
before reuse. When `baseBranch` is not yet in the branch, Sandcastle commits
any uncommitted work ("WIP: work retained from an earlier attempt") and merges
the base in. A conflicting merge is aborted and the branch is reused as before,
with a warning.
