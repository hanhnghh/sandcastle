---
"@ai-hero/sandcastle": minor
---

`merge.gate` runs the cumulative gate as a script instead of inside the merger
agent. The merger integrates and commits; the host then runs `gate.command`
(`{{BATCH_BASE_SHA}}` replaced) in the merger's sandbox through the new
`command()` provider, which runs a shell command in place of a model. A failing
gate's last 200 lines go back to the merger as `{{GATE_FAILURE}}` for up to
`gate.repairs` repairs (default 1); a passing gate closes the issues with a
comment naming the head and command. Without `merge.gate` nothing changes.
