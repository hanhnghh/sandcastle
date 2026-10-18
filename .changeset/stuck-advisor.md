---
"@ai-hero/sandcastle": minor
---

Add the stuck advisor (`advisor.stuck: "on"`). When an implementation ends
incomplete, times out idle, or exhausts the review repair budget, the advisor
diagnoses the stall read-only (diff including uncommitted work, status, output
tail, open findings) and the implementer gets up to `advisor.stuckAttempts`
advised attempts; review stalls go through a fresh review loop. Escalation and
environment or missing-dependency causes go straight to the owner, and an
unresolved stall reports the diagnosis instead of only the raw log.
