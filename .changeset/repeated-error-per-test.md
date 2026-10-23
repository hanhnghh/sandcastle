---
"@ai-hero/sandcastle": patch
---

The repeated-error checkpoint signal now counts errors per failing test. An
error under a Playwright or Vitest failure header, or followed by a stack frame
in a test file, is tagged with that test, so many stale tests failing the same
way ("locator.click: Timeout 5000ms exceeded") no longer look like one error
retried and exhaust the checkpoint cap.
